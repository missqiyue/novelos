pub mod agent_io;
pub mod agents;
mod commands;
pub mod compiler;
mod db;
mod llm;
pub mod orchestrator;
pub mod rag;

use commands::llm::{LlmState, StreamCancelTokens};
use commands::task_manager::TaskRegistry;
use db::DbState;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Notify frontend before closing so it can emergency-save
                let _ = window.emit("close-requested", ());
                // Prevent default close — frontend will call app.exit() after saving
                api.prevent_close();
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let db_state = DbState::new(&handle)?;
            app.manage(db_state);

            // Open devtools for debugging
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            app.manage(LlmState::new());
            app.manage(StreamCancelTokens(Mutex::new(HashMap::new())));
            app.manage(TaskRegistry::new());

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Project
            commands::project::create_project,
            commands::project::get_project,
            commands::project::switch_project,
            commands::project::close_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::project::export_project_txt,
            commands::project::export_project_md,
            commands::project::export_project_docx,
            commands::project::export_project_epub,
            commands::project::export_project_pdf,
            commands::project::import_project_txt,
            commands::project::batch_export_chapters,
            // Bookshelf
            commands::bookshelf::list_bookshelf,
            commands::bookshelf::add_to_bookshelf,
            commands::bookshelf::remove_from_bookshelf,
            commands::bookshelf::update_bookshelf_item,
            commands::bookshelf::reorder_bookshelf,
            commands::bookshelf::list_de_ai_rules,
            commands::bookshelf::upsert_de_ai_rule,
            commands::bookshelf::delete_de_ai_rule,
            commands::bookshelf::list_soul_templates,
            commands::bookshelf::list_genre_templates,
            // Canon
            commands::canon::list_canon_rules,
            commands::canon::create_canon_rule,
            commands::canon::get_canon_rule,
            commands::canon::update_canon_rule,
            commands::canon::delete_canon_rule,
            commands::canon::list_canon_rule_versions,
            commands::canon::search_canon_rules,
            // Reader Feedback (WF-030)
            commands::reader_feedback::start_reader_feedback_workflow,
            commands::reader_feedback::execute_feedback_revision,
            // Retcon
            commands::retcon::create_retcon_request,
            commands::retcon::list_retcon_requests,
            commands::retcon::update_retcon_status,
            commands::retcon::analyze_retcon_impact,
            commands::retcon::select_retcon_scheme,
            commands::retcon::approve_retcon,
            commands::retcon::reject_retcon,
            commands::retcon::execute_retcon,
            commands::retcon::retcon_post_check,
            commands::retcon::update_retcon_snapshots,
            // Retcon Workflow (WF-020~022)
            commands::retcon_workflow::start_retcon_workflow,
            commands::retcon_workflow::continue_retcon_workflow,
            commands::retcon_workflow::complete_retcon_workflow,
            commands::retcon_workflow::rollback_retcon,
            // Outline
            commands::outline::get_book_outline,
            commands::outline::save_book_outline,
            commands::outline::list_volume_outlines,
            commands::outline::save_volume_outline,
            commands::outline::list_chapter_outlines,
            commands::outline::save_chapter_outline,
            commands::outline::confirm_chapter_outline,
            commands::outline::list_volumes,
            commands::outline::update_volume,
            commands::outline::list_arcs,
            commands::outline::create_arc,
            commands::outline::analyze_outline_impact,
            commands::outline::list_event_nodes,
            // Outline Revision (OUT-007)
            commands::outline_revision::start_outline_revision,
            commands::outline_revision::confirm_outline_revision,
            // Degradation (WF-002~003)
            commands::degradation::run_genre_match_with_fallback,
            commands::degradation::run_agent_step_with_skip,
            commands::degradation::list_skipped_steps,
            // Chapter
            commands::chapter::list_chapter_tasks,
            commands::chapter::create_chapter_task,
            commands::chapter::list_chapters,
            commands::chapter::get_chapter,
            commands::chapter::create_chapter,
            commands::chapter::update_chapter_draft,
            commands::chapter::finalize_chapter,
            commands::chapter::list_chapter_versions,
            commands::chapter::rollback_chapter,
            commands::chapter::transition_chapter_state,
            commands::chapter::get_valid_transitions,
            commands::chapter::set_compile_status,
            commands::chapter::set_review_status,
            commands::chapter::search_chapters,
            commands::chapter::search_chapters_with_highlights,
            commands::chapter::get_volume_word_stats,
            commands::chapter::recall_context_for_chapter,
            commands::chapter::list_characters,
            commands::chapter::create_character,
            commands::chapter::update_character,
            commands::chapter::delete_character,
            commands::chapter::get_chapter_statistics,
            commands::chapter::auto_generate_chapter_outline,
            // LLM
            commands::llm::get_llm_config,
            commands::llm::update_llm_config,
            commands::llm::chat_completion,
            commands::llm::chat_with_system_prompt,
            commands::llm::save_llm_config_to_db,
            commands::llm::load_llm_config_from_db,
            commands::llm::get_token_usage,
            commands::llm::chat_completion_stream,
            commands::llm::cancel_stream,
            // Agent
            commands::agent::list_agents,
            commands::agent::run_agent,
            commands::agent::list_agent_logs,
            commands::agent::list_agent_prompts,
            commands::agent::get_agent_prompt,
            commands::agent::save_agent_prompt,
            commands::agent::reset_agent_prompt,
            // Compiler
            commands::compiler::compile_chapter,
            commands::compiler::run_paragraph_rewrite,
            // Ledger
            commands::ledger::list_character_states,
            commands::ledger::upsert_character_state,
            commands::ledger::delete_character_state,
            commands::ledger::list_relationship_states,
            commands::ledger::upsert_relationship_state,
            commands::ledger::list_timeline_nodes,
            commands::ledger::upsert_timeline_node,
            commands::ledger::list_foreshadow_items,
            commands::ledger::upsert_foreshadow_item,
            commands::ledger::list_ability_items,
            commands::ledger::upsert_ability_item,
            commands::ledger::list_knowledge_visibility,
            commands::ledger::upsert_knowledge_visibility,
            commands::ledger::list_notifications,
            commands::ledger::create_notification,
            commands::ledger::mark_notification_read,
            commands::ledger::get_unread_notification_count,
            commands::ledger::get_ledger_summary,
            // Snapshot
            commands::snapshot::generate_chapter_snapshot,
            commands::snapshot::generate_arc_snapshot,
            commands::snapshot::generate_volume_snapshot,
            commands::snapshot::list_snapshots,
            commands::snapshot::get_latest_snapshot_before_chapter,
            // Ledger extras
            commands::ledger::update_character_state_after_chapter_cmd,
            commands::ledger::recall_ledger_context,
            // Risk
            commands::risk::check_project_risks,
            commands::risk::generate_project_health_report,
            // Orchestrator
            commands::orchestrator::run_chapter_pipeline,
            commands::orchestrator::run_batch_pipeline,
            commands::orchestrator::run_batch_pipeline_concurrent,
            // Backup
            commands::backup::create_backup,
            commands::backup::list_backups,
            commands::backup::restore_backup,
            // Crash Recovery
            commands::crash_recovery::emergency_save_draft,
            commands::crash_recovery::check_crash_recovery,
            commands::crash_recovery::restore_crash_draft,
            commands::crash_recovery::discard_crash_recovery,
            // Compliance Shield
            commands::compliance::scan_chapter_compliance,
            commands::compliance::scan_all_chapters_compliance,
            commands::compliance::list_compliance_words,
            commands::compliance::add_compliance_word,
            commands::compliance::delete_compliance_word,
            // RAG
            commands::rag::search_similar_chapters,
            commands::rag::rag_semantic_recall,
            commands::rag::clear_book_index,
            commands::rag::get_index_stats,
            // Chapter merge
            commands::chapter::merge_recall_results,
            // Recall (RCL-001~004)
            commands::recall::assemble_recall_context,
            commands::recall::full_recall_context,
            // Seed
            commands::seed::create_sample_project,
            // Task Manager (SHF-004)
            commands::task_manager::register_task,
            commands::task_manager::update_task_progress,
            commands::task_manager::complete_task,
            commands::task_manager::fail_task,
            commands::task_manager::cancel_task,
            commands::task_manager::pause_task,
            commands::task_manager::resume_task,
            commands::task_manager::list_project_tasks,
            commands::task_manager::list_all_tasks,
            commands::task_manager::cancel_project_tasks,
            commands::task_manager::pause_project_tasks,
            commands::task_manager::cleanup_tasks,
            // Shared Resources (SHF-005)
            commands::shared_resources::list_style_profiles,
            commands::shared_resources::list_writing_patterns,
            commands::shared_resources::upsert_style_profile,
            commands::shared_resources::delete_style_profile,
            commands::shared_resources::upsert_writing_pattern,
            commands::shared_resources::apply_genre_template_to_project,
            commands::shared_resources::apply_style_profile_to_project,
            commands::shared_resources::import_deai_rules_to_project,
            commands::shared_resources::list_global_resources,
            commands::shared_resources::get_editor_prefs,
            commands::shared_resources::set_editor_prefs,
            commands::world::list_locations,
            commands::world::create_location,
            commands::world::update_location,
            commands::world::delete_location,
            commands::world::list_factions,
            commands::world::create_faction,
            commands::world::update_faction,
            commands::world::delete_faction,
            commands::world::check_collisions,
            // Writing Sessions
            commands::sessions::start_writing_session,
            commands::sessions::end_writing_session,
            commands::sessions::list_writing_sessions,
            // Window theme
            commands::window::set_window_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
