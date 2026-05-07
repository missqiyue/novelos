mod db;
mod pipeline;
mod llm;
mod rag;

use std::fs;
use std::sync::Mutex;
use db::DbState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            
            let books_dir = app_data_dir.join("books");
            fs::create_dir_all(&books_dir)?;

            let workspace_db_path = app_data_dir.join("workspace.db");
            let legacy_db_path = app_data_dir.join("inkos_world.db");

            let mut needs_legacy_migration = false;
            if legacy_db_path.exists() && !workspace_db_path.exists() {
                needs_legacy_migration = true;
            }

            let workspace_conn = db::init_workspace_db(&workspace_db_path)?;

            if needs_legacy_migration {
                let default_book_db = books_dir.join("book_1.db");
                if let Err(e) = fs::rename(&legacy_db_path, &default_book_db) {
                    eprintln!("Failed to migrate legacy db: {}", e);
                } else {
                    workspace_conn.execute(
                        "INSERT INTO workspace_books (title, db_file) VALUES (?1, ?2)",
                        rusqlite::params!["Legacy Book", "book_1.db"],
                    )?;
                }
            }

            // Find last opened book
            let mut book_conn_opt = None;
            let db_file_opt: Option<String> = workspace_conn.query_row(
                "SELECT db_file FROM workspace_books ORDER BY last_opened DESC LIMIT 1",
                [],
                |row| row.get(0)
            ).ok();
            if let Some(db_file) = db_file_opt {
                let book_path = books_dir.join(&db_file);
                if book_path.exists() {
                    if let Ok(conn) = db::init_book_db(&book_path) {
                        book_conn_opt = Some(conn);
                    }
                }
            }

            if let Some(ref book_conn) = book_conn_opt {
                let _ = db::maybe_restore_workspace_config_from_book(&workspace_conn, Some(book_conn));
            }

            app.manage(DbState {
                workspace_conn: Mutex::new(workspace_conn),
                book_conn: Mutex::new(book_conn_opt),
                app_data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::get_active_hooks,
            db::get_workspace_books,
            db::switch_workspace_book,
            db::create_workspace_book,
            db::delete_workspace_book,
            db::get_pending_hooks,
            db::set_hook_resolved,
            db::cleanup_pending_hooks,
            db::cleanup_consequence_ledger,
            db::get_config,
            db::save_config,
            db::test_llm_connection,
            db::get_book_meta,
            db::get_active_plan_version_id,
            db::set_active_plan_version_id,
            db::get_planning_context,
            db::get_chapters,
            db::save_chapter_content,
            db::save_chapter_draft_raw,
            db::save_chapter_title,
            db::compute_compliance_report,
            db::get_latest_compliance_report,
            db::get_compliance_report_history,
            db::save_chapter_outline,
            db::update_chapter_status,
            db::get_board_overview,
            db::get_board_chapter_bucket_overview,
            db::get_board_chapter_list,
            db::get_character_graph,
            pipeline::generate_next_chapter_outline,
            db::get_characters,
            db::add_character,
            db::get_world_locations,
            db::add_world_location,
            db::get_world_items,
            db::add_world_item,
            db::get_world_fact_proposals,
            db::accept_world_fact_proposal,
            db::reject_world_fact_proposal,
            db::reextract_world_facts_from_chapters,
            db::get_temporal_states,
            db::update_temporal_state,
            db::delete_temporal_state,
            db::get_outline_rows,
            db::save_outline_patches,
            db::set_outline_locked_range,
            db::get_stage_plan,
            db::get_outline_checkpoints,
            db::get_story_threads,
            db::upsert_story_thread,
            db::delete_story_thread,
            db::get_character_core,
            db::update_character_core,
            db::get_character_soul_timeline,
            db::upsert_character_soul_timeline,
            db::delete_character_soul_timeline,
            db::get_character_relations,
            db::upsert_character_relation,
            db::delete_character_relation,
            db::get_proposals,
            db::accept_proposal,
            db::reject_proposal,
            
            pipeline::generate_chapter_outline,
            pipeline::generate_chapter_pipeline,
            pipeline::get_dynamic_context,
            pipeline::process_chapter_hooks,
            pipeline::run_structured_review,
            pipeline::get_latest_structured_review,
            pipeline::get_structured_review_history,
            pipeline::run_audit,
            pipeline::simulate_reader_reactions,
            pipeline::apply_audit_suggestions,
            pipeline::rewrite_based_on_readers,
            pipeline::apply_full_review_fix,
            pipeline::rewrite_chapter_with_constraints,
            pipeline::generate_character_profile,
            pipeline::ai_extract_world_facts_from_chapters,
            pipeline::ai_propose_outline_patch_from_chapter,
            pipeline::ai_propose_threads_from_chapter,
            pipeline::ai_propose_soul_timeline_from_chapter,
            pipeline::blueprint_create_version,
            pipeline::blueprint_get_latest_version,
            pipeline::blueprint_generate_cast,
            pipeline::blueprint_generate_system_spec,
            pipeline::blueprint_generate_stage_plan,
            pipeline::blueprint_generate_one_liner_batch,
            pipeline::blueprint_continue_next_batch,
            pipeline::blueprint_seed_threads_from_stage_plan,
            pipeline::blueprint_generate_soul_timeline_for_range,
            pipeline::recompute_outline_checkpoint
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Tauri run error: {:?}", e);
        std::process::exit(1);
    }
}
