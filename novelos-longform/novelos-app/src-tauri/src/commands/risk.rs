use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── NTF-003: Risk alert rules ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskItem {
    pub risk_type: String,
    pub severity: String,
    pub message: String,
    pub related_entity: Option<String>,
    pub chapter_number: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RiskReport {
    pub total_risks: usize,
    pub items: Vec<RiskItem>,
    pub generated_at: String,
}

/// Internal helper that performs all risk checks against an open connection.
/// Used by both `check_project_risks` and `generate_project_health_report`.
fn do_check_project_risks(conn: &rusqlite::Connection) -> Result<Vec<RiskItem>, String> {
    let mut items: Vec<RiskItem> = Vec::new();

    // Determine the maximum chapter number for relative comparisons
    let max_chapter: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(chapter_number), 0) FROM chapters",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if max_chapter == 0 {
        return Ok(items);
    }

    // ── Rule 1: Foreshadows overdue > 30 chapters ──
    // A foreshadow is "overdue" if it was planted more than 30 chapters ago and is still unresolved.
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, seed_chapter FROM foreshadow_items WHERE status = 'planted' AND (?1 - seed_chapter) > 30 ORDER BY seed_chapter",
            )
            .map_err(|e| e.to_string())?;

        let overdue: Vec<(String, String, i64)> = stmt
            .query_map(rusqlite::params![max_chapter], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        for (id, title, seed) in overdue {
            let gap = max_chapter - seed;
            items.push(RiskItem {
                risk_type: "foreshadow_overdue".to_string(),
                severity: "warning".to_string(),
                message: format!(
                    "伏笔「{}」已埋下{}章仍未回收（第{}章埋下，当前第{}章）",
                    title, gap, seed, max_chapter
                ),
                related_entity: Some(id),
                chapter_number: Some(seed),
            });
        }
    }

    // ── Rule 2: Compile failures accumulating ──
    {
        let fail_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM chapters WHERE compiler_status = 'fail'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if fail_count >= 3 {
            // Collect the specific failed chapters
            let mut stmt = conn
                .prepare(
                    "SELECT id, chapter_number, title FROM chapters WHERE compiler_status = 'fail' ORDER BY chapter_number",
                )
                .map_err(|e| e.to_string())?;
            let failed: Vec<(String, i64, Option<String>)> = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            let severity = if fail_count >= 10 {
                "critical"
            } else if fail_count >= 6 {
                "warning"
            } else {
                "info"
            };

            for (id, cn, title) in &failed {
                items.push(RiskItem {
                    risk_type: "compile_failure_accumulation".to_string(),
                    severity: severity.to_string(),
                    message: format!(
                        "编译失败累积：第{}章「{}」编译未通过（共{}章失败）",
                        cn,
                        title.as_deref().unwrap_or("未命名"),
                        fail_count
                    ),
                    related_entity: Some(id.clone()),
                    chapter_number: Some(*cn),
                });
            }
        } else if fail_count > 0 {
            // Even a single failure is worth noting
            let mut stmt = conn
                .prepare(
                    "SELECT id, chapter_number, title FROM chapters WHERE compiler_status = 'fail' ORDER BY chapter_number",
                )
                .map_err(|e| e.to_string())?;
            let failed: Vec<(String, i64, Option<String>)> = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            for (id, cn, title) in &failed {
                items.push(RiskItem {
                    risk_type: "compile_failure".to_string(),
                    severity: "info".to_string(),
                    message: format!(
                        "第{}章「{}」编译未通过",
                        cn,
                        title.as_deref().unwrap_or("未命名")
                    ),
                    related_entity: Some(id.clone()),
                    chapter_number: Some(*cn),
                });
            }
        }
    }

    // ── Rule 3: Chapters with 0 word count ──
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, chapter_number, title, status FROM chapters WHERE word_count = 0 OR word_count IS NULL ORDER BY chapter_number",
            )
            .map_err(|e| e.to_string())?;
        let empty: Vec<(String, i64, Option<String>, String)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        for (id, cn, title, status) in &empty {
            let severity = if status == "finalized" {
                "warning"
            } else {
                "info"
            };
            items.push(RiskItem {
                risk_type: "zero_word_count".to_string(),
                severity: severity.to_string(),
                message: format!(
                    "第{}章「{}」字数为0（状态：{}）",
                    cn,
                    title.as_deref().unwrap_or("未命名"),
                    status
                ),
                related_entity: Some(id.clone()),
                chapter_number: Some(*cn),
            });
        }
    }

    // ── Rule 4: Characters inactive for > 20 chapters ──
    {
        let threshold = max_chapter - 20;
        if threshold > 0 {
            let mut stmt = conn
                .prepare(
                    "SELECT c.id, c.name, COALESCE(MAX(cs.chapter_to), MAX(cs.chapter_from), 0) AS last_chapter \
                     FROM characters c \
                     LEFT JOIN character_states cs ON cs.character_id = c.id \
                     WHERE c.status = 'active' \
                     GROUP BY c.id \
                     HAVING last_chapter < ?1 AND last_chapter > 0",
                )
                .map_err(|e| e.to_string())?;

            let inactive: Vec<(String, String, i64)> = stmt
                .query_map(rusqlite::params![threshold], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            for (id, name, last_ch) in inactive {
                let gap = max_chapter - last_ch;
                items.push(RiskItem {
                    risk_type: "character_inactive".to_string(),
                    severity: "info".to_string(),
                    message: format!(
                        "角色「{}」已{}章未出现（最后出现于第{}章，当前第{}章）",
                        name, gap, last_ch, max_chapter
                    ),
                    related_entity: Some(id),
                    chapter_number: Some(last_ch),
                });
            }
        }
    }

    // Also check for characters with no state entries at all (never appeared)
    {
        let mut stmt = conn
            .prepare(
                "SELECT c.id, c.name FROM characters c \
                 WHERE c.status = 'active' \
                 AND NOT EXISTS (SELECT 1 FROM character_states cs WHERE cs.character_id = c.id)",
            )
            .map_err(|e| e.to_string())?;
        let never_appeared: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        for (id, name) in never_appeared {
            items.push(RiskItem {
                risk_type: "character_never_appeared".to_string(),
                severity: "info".to_string(),
                message: format!("角色「{}」尚未在任何章节中出现", name),
                related_entity: Some(id),
                chapter_number: None,
            });
        }
    }

    Ok(items)
}

/// Extended risk rules from §33 of the design doc.
fn do_check_extended_risks(
    conn: &rusqlite::Connection,
    max_chapter: i64,
    items: &mut Vec<RiskItem>,
) -> Result<(), String> {
    if max_chapter == 0 {
        return Ok(());
    }

    // ── Rule 5: 设定膨胀 — 近50章新增设定>15%原设定 ──
    {
        let total_rules: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM canon_rules WHERE status = 'active'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if total_rules > 0 {
            // Count rules created in recent chapters range (approx via created_at)
            // Since canon_rules don't have chapter_number, use a proxy: rules added recently
            let recent_rules: i64 = conn.query_row(
                "SELECT COUNT(*) FROM canon_rules WHERE status = 'active' AND created_at > datetime('now', '-30 days')",
                [], |r| r.get(0)
            ).unwrap_or(0);

            let growth_pct = (recent_rules as f64 / total_rules as f64) * 100.0;
            if growth_pct > 15.0 {
                items.push(RiskItem {
                    risk_type: "setting_inflation".to_string(),
                    severity: "warning".to_string(),
                    message: format!(
                        "近期新增设定占比{:.0}%，超过15%阈值，可能设定膨胀，建议合并或冻结部分设定",
                        growth_pct
                    ),
                    related_entity: None,
                    chapter_number: None,
                });
            }
        }
    }

    // ── Rule 6: 战力通胀 — 主角近20章连续升级无代价 ──
    {
        // Check if protagonist's character_states show level upgrades in recent 20 chapters
        let protagonist_id: Option<String> = conn.query_row(
            "SELECT id FROM characters WHERE role_type = 'protagonist' AND status = 'active' LIMIT 1",
            [], |r| r.get(0)
        ).ok();

        if let Some(pid) = protagonist_id {
            let recent_upgrades: i64 = conn.query_row(
                "SELECT COUNT(*) FROM character_states WHERE character_id = ?1 AND chapter_from >= ?2 AND level_state IS NOT NULL AND level_state != ''",
                rusqlite::params![pid, (max_chapter - 20).max(1)],
                |r| r.get(0)
            ).unwrap_or(0);

            if recent_upgrades >= 5 {
                // Check if there are corresponding cost entries in ability_items
                let costs: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM ability_items WHERE owner_character_id = ?1 AND cost_rule IS NOT NULL AND cost_rule != ''",
                    rusqlite::params![pid],
                    |r| r.get(0)
                ).unwrap_or(0);

                if costs < recent_upgrades / 2 {
                    items.push(RiskItem {
                        risk_type: "power_inflation".to_string(),
                        severity: "warning".to_string(),
                        message: format!(
                            "主角近20章有{}次升级但代价铺垫不足({}项)，建议增加代价设定",
                            recent_upgrades, costs
                        ),
                        related_entity: Some(pid),
                        chapter_number: None,
                    });
                }
            }
        }
    }

    // ── Rule 7: 时间线模糊 — 连续5章无时间线记录 ──
    {
        if max_chapter >= 5 {
            let recent_with_timeline: i64 = conn.query_row(
                "SELECT COUNT(DISTINCT chapter_number) FROM timeline_nodes WHERE chapter_number > ?1",
                rusqlite::params![max_chapter - 5],
                |r| r.get(0)
            ).unwrap_or(0);

            let recent_chapters: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM chapters WHERE chapter_number > ?1",
                    rusqlite::params![max_chapter - 5],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            if recent_chapters > 0 && recent_with_timeline == 0 {
                items.push(RiskItem {
                    risk_type: "timeline_gap".to_string(),
                    severity: "info".to_string(),
                    message: format!(
                        "连续{}章无时间线记录，建议补录时间线节点",
                        recent_chapters.min(5)
                    ),
                    related_entity: None,
                    chapter_number: Some(max_chapter),
                });
            }
        }
    }

    // ── Rule 8: 章节字数异常 — 超出 min/max_chapter_words ──
    {
        let min_words: i64 = conn
            .query_row("SELECT min_chapter_words FROM projects LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap_or(1500);
        let max_words: i64 = conn
            .query_row("SELECT max_chapter_words FROM projects LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap_or(5000);

        let mut stmt = conn.prepare(
            "SELECT id, chapter_number, title, word_count FROM chapters WHERE word_count IS NOT NULL AND (word_count < ?1 OR word_count > ?2) ORDER BY chapter_number"
        ).map_err(|e| e.to_string())?;

        let abnormal: Vec<(String, i64, Option<String>, i64)> = stmt
            .query_map(rusqlite::params![min_words, max_words], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for (id, cn, title, wc) in &abnormal {
            let severity = if *wc < min_words / 2 || *wc > max_words * 2 {
                "warning"
            } else {
                "info"
            };
            let direction = if *wc < min_words { "过短" } else { "过长" };
            items.push(RiskItem {
                risk_type: "word_count_abnormal".to_string(),
                severity: severity.to_string(),
                message: format!(
                    "第{}章「{}」字数{}（{}字，范围{}~{}）",
                    cn,
                    title.as_deref().unwrap_or("未命名"),
                    direction,
                    wc,
                    min_words,
                    max_words
                ),
                related_entity: Some(id.clone()),
                chapter_number: Some(*cn),
            });
        }
    }

    // ── Rule 9: 字数持续下降/上升 — 连续10章字数单调变化 ──
    {
        if max_chapter >= 10 {
            let mut stmt = conn.prepare(
                "SELECT chapter_number, word_count FROM chapters WHERE word_count IS NOT NULL AND chapter_number > ?1 ORDER BY chapter_number"
            ).map_err(|e| e.to_string())?;

            let words: Vec<(i64, i64)> = stmt
                .query_map(rusqlite::params![max_chapter - 10], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

            if words.len() >= 5 {
                let mut decreasing = true;
                let mut increasing = true;
                for i in 1..words.len() {
                    if words[i].1 >= words[i - 1].1 {
                        decreasing = false;
                    }
                    if words[i].1 <= words[i - 1].1 {
                        increasing = false;
                    }
                }

                if decreasing {
                    items.push(RiskItem {
                        risk_type: "word_count_decreasing".to_string(),
                        severity: "info".to_string(),
                        message: format!(
                            "近{}章字数持续递减（从{}字降至{}字），可能注水减少或节奏变化",
                            words.len(),
                            words[0].1,
                            words.last().unwrap().1
                        ),
                        related_entity: None,
                        chapter_number: Some(max_chapter),
                    });
                }
                if increasing {
                    items.push(RiskItem {
                        risk_type: "word_count_increasing".to_string(),
                        severity: "info".to_string(),
                        message: format!(
                            "近{}章字数持续递增（从{}字升至{}字），可能描写膨胀",
                            words.len(),
                            words[0].1,
                            words.last().unwrap().1
                        ),
                        related_entity: None,
                        chapter_number: Some(max_chapter),
                    });
                }
            }
        }
    }

    // ── Rule 10: 写作速度骤降 — 近7天日均字数 < 近30天日均 × 50% ──
    {
        let words_7d: i64 = conn.query_row(
            "SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE updated_at > datetime('now', '-7 days') AND word_count IS NOT NULL",
            [], |r| r.get(0)
        ).unwrap_or(0);
        let words_30d: i64 = conn.query_row(
            "SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE updated_at > datetime('now', '-30 days') AND word_count IS NOT NULL",
            [], |r| r.get(0)
        ).unwrap_or(0);

        let daily_7d = words_7d as f64 / 7.0;
        let daily_30d = words_30d as f64 / 30.0;

        if daily_30d > 0.0 && daily_7d < daily_30d * 0.5 {
            items.push(RiskItem {
                risk_type: "writing_speed_drop".to_string(),
                severity: "info".to_string(),
                message: format!(
                    "近7天日均{:.0}字，仅为近30天日均{:.0}字的{:.0}%，写作效率下降",
                    daily_7d,
                    daily_30d,
                    (daily_7d / daily_30d * 100.0)
                ),
                related_entity: None,
                chapter_number: None,
            });
        }
    }

    // ── Rule 11: AI味回升 — 连续3章review_status含ai_residual标记 ──
    {
        let mut stmt = conn.prepare(
            "SELECT chapter_number, review_status FROM chapters WHERE review_status IS NOT NULL AND review_status != '' ORDER BY chapter_number DESC LIMIT 3"
        ).map_err(|e| e.to_string())?;

        let recent_reviews: Vec<(i64, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let ai_flagged = recent_reviews
            .iter()
            .filter(|(_, status)| {
                status.contains("ai_residual")
                    || status.contains("voice_fix")
                    || status.contains("high_ai")
            })
            .count();

        if ai_flagged >= 3 {
            items.push(RiskItem {
                risk_type: "ai_taste_increase".to_string(),
                severity: "warning".to_string(),
                message: "连续3章检测到AI痕迹偏高，建议调整文风参数或加强去AI过滤".to_string(),
                related_entity: None,
                chapter_number: Some(max_chapter),
            });
        }
    }

    Ok(())
}

/// Check project risks and return a list of risk items (NTF-003)
#[tauri::command]
pub fn check_project_risks(db: State<'_, DbState>) -> Result<RiskReport, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut items = do_check_project_risks(conn)?;

    // Add extended §33 risk rules
    let max_chapter: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(chapter_number), 0) FROM chapters",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    do_check_extended_risks(conn, max_chapter, &mut items)?;

    let total_risks = items.len();

    Ok(RiskReport {
        total_risks,
        items,
        generated_at: now,
    })
}

// ─── Project Health Report ───

#[derive(Debug, Serialize, Deserialize)]
pub struct CompilerStats {
    pub total_compiled: i64,
    pub pass_count: i64,
    pub fail_count: i64,
    pub pass_rate: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ForeshadowHealth {
    pub total: i64,
    pub planted: i64,
    pub resolved: i64,
    pub overdue: i64,
    pub health_pct: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterProgress {
    pub total: i64,
    pub finalized: i64,
    pub drafting: i64,
    pub completion_pct: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CharacterCompleteness {
    pub total: i64,
    pub with_soul: i64,
    pub without_soul: i64,
    pub completeness_pct: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectHealthReport {
    pub overall_score: i64,
    pub compiler_stats: CompilerStats,
    pub foreshadow_health: ForeshadowHealth,
    pub chapter_progress: ChapterProgress,
    pub character_completeness: CharacterCompleteness,
    pub top_risks: Vec<RiskItem>,
    pub recommendations: Vec<String>,
    pub generated_at: String,
}

/// Generate a comprehensive project health report aggregating data from all checkers.
#[tauri::command]
pub fn generate_project_health_report(
    db: State<'_, DbState>,
) -> Result<ProjectHealthReport, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let now = chrono::Utc::now().to_rfc3339();

    // ── Compiler stats ──
    let total_compiled: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE compiler_status IS NOT NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let pass_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE compiler_status = 'pass'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let fail_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE compiler_status = 'fail'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let pass_rate = if total_compiled > 0 {
        (pass_count as f64 / total_compiled as f64) * 100.0
    } else {
        100.0
    };

    // ── Foreshadow health ──
    let foreshadow_total: i64 = conn
        .query_row("SELECT COUNT(*) FROM foreshadow_items", [], |r| r.get(0))
        .unwrap_or(0);

    let foreshadow_planted: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM foreshadow_items WHERE status = 'planted'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let foreshadow_resolved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM foreshadow_items WHERE status = 'resolved'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let foreshadow_overdue: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM foreshadow_items WHERE status = 'overdue'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let foreshadow_health_pct = if foreshadow_total > 0 {
        ((foreshadow_resolved as f64 + foreshadow_planted as f64 * 0.5) / foreshadow_total as f64)
            * 100.0
    } else {
        100.0
    };

    // ── Chapter progress ──
    let chapter_total: i64 = conn
        .query_row("SELECT COUNT(*) FROM chapters", [], |r| r.get(0))
        .unwrap_or(0);

    let chapter_finalized: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE status IN ('finalized', 'archived')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let chapter_drafting: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE status IN ('drafting', 'draft_generated', 'reviewing', 'approved')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let chapter_completion_pct = if chapter_total > 0 {
        (chapter_finalized as f64 / chapter_total as f64) * 100.0
    } else {
        0.0
    };

    // ── Character completeness ──
    let char_total: i64 = conn
        .query_row("SELECT COUNT(*) FROM characters", [], |r| r.get(0))
        .unwrap_or(0);

    let char_with_soul: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM characters WHERE soul_json IS NOT NULL AND soul_json != '' AND soul_json != '{}'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let char_without_soul = char_total - char_with_soul;

    let char_completeness_pct = if char_total > 0 {
        (char_with_soul as f64 / char_total as f64) * 100.0
    } else {
        100.0
    };

    // ── Risk assessment ──
    let all_risks = do_check_project_risks(conn)?;

    let severity_score = |s: &str| match s {
        "critical" => 3,
        "warning" => 2,
        _ => 1,
    };

    let mut sorted_risks = all_risks.clone();
    sorted_risks.sort_by(|a, b| severity_score(&b.severity).cmp(&severity_score(&a.severity)));
    let top_risks: Vec<RiskItem> = sorted_risks.into_iter().take(5).collect();

    // ── Overall score (weighted) ──
    let compiler_weight = 0.30;
    let foreshadow_weight = 0.25;
    let chapter_weight = 0.25;
    let character_weight = 0.20;

    let score = (pass_rate * compiler_weight)
        + (foreshadow_health_pct * foreshadow_weight)
        + (chapter_completion_pct * chapter_weight)
        + (char_completeness_pct * character_weight);

    // Penalize for open risks
    let risk_penalty = (all_risks.len() as f64 * 0.5).min(15.0);
    let overall_score = ((score - risk_penalty).max(0.0)).round() as i64;

    // ── Recommendations ──
    let mut recommendations: Vec<String> = Vec::new();

    if fail_count > 0 {
        recommendations.push(format!(
            "有{}章编译未通过，建议优先修复编译错误以提升作品质量",
            fail_count
        ));
    }
    if foreshadow_planted > 5 {
        recommendations.push(format!(
            "有{}个伏笔尚未回收，建议规划回收时间线避免遗忘",
            foreshadow_planted
        ));
    }
    if foreshadow_overdue > 0 {
        recommendations.push(format!(
            "{}个伏笔已过期，建议尽快处理或标记为废弃",
            foreshadow_overdue
        ));
    }
    if chapter_total > 0 && chapter_completion_pct < 30.0 {
        recommendations.push(format!(
            "全书完成度仅{:.0}%，建议加快撰写进度",
            chapter_completion_pct
        ));
    }
    if char_without_soul > 0 {
        recommendations.push(format!(
            "{}个角色尚未设定心魂(soul)，完善角色设定能提升人物深度",
            char_without_soul
        ));
    }
    if char_total == 0 {
        recommendations.push("项目尚无角色，建议先创建主要角色".to_string());
    }
    if chapter_total == 0 {
        recommendations.push("项目尚无章节，建议从大纲开始规划全书结构".to_string());
    }
    if all_risks.len() >= 10 {
        recommendations.push(format!(
            "当前存在{}个风险项，建议逐一排查并制定修复计划",
            all_risks.len()
        ));
    }
    if pass_rate >= 95.0 && chapter_completion_pct >= 80.0 && foreshadow_health_pct >= 80.0 {
        recommendations.push("项目整体状态良好，继续保持当前节奏".to_string());
    }

    // Ensure we have at least one recommendation
    if recommendations.is_empty() {
        recommendations.push("项目运行正常，暂无特别建议".to_string());
    }

    Ok(ProjectHealthReport {
        overall_score,
        compiler_stats: CompilerStats {
            total_compiled,
            pass_count,
            fail_count,
            pass_rate,
        },
        foreshadow_health: ForeshadowHealth {
            total: foreshadow_total,
            planted: foreshadow_planted,
            resolved: foreshadow_resolved,
            overdue: foreshadow_overdue,
            health_pct: foreshadow_health_pct,
        },
        chapter_progress: ChapterProgress {
            total: chapter_total,
            finalized: chapter_finalized,
            drafting: chapter_drafting,
            completion_pct: chapter_completion_pct,
        },
        character_completeness: CharacterCompleteness {
            total: char_total,
            with_soul: char_with_soul,
            without_soul: char_without_soul,
            completeness_pct: char_completeness_pct,
        },
        top_risks,
        recommendations,
        generated_at: now,
    })
}
