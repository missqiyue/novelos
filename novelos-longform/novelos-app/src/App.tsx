import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { AppShell } from "./components/layout/AppShell";
import { BookshelfPage } from "./components/bookshelf/BookshelfPage";
import { ProjectSetupPage } from "./components/project/ProjectSetupPage";
import { CanonPage } from "./components/canon/CanonPage";
import { OutlinePage } from "./components/outline/OutlinePage";
import { ChapterWorkbench } from "./components/chapter/ChapterWorkbench";
import { CharactersPage } from "./components/character/CharactersPage";
import { CharacterDetailPage } from "./components/character/CharacterDetailPage";
import { CharacterWizardPage } from "./components/character/CharacterWizardPage";
import { LedgerPage } from "./components/ledger/LedgerPage";
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { WritingAnalytics } from "./components/dashboard/WritingAnalytics";
import { ChapterComparePage } from "./components/chapter/ChapterComparePage";
import { RetconPage } from "./components/retcon/RetconPage";
import { SettingsPage } from "./components/common/SettingsPage";
import { DeAiRulesPage } from "./components/settings/DeAiRulesPage";
import { SoulTemplatesPage, GenreTemplatesPage } from "./components/settings/TemplatePages";
import { NotificationPrefsPage } from "./components/settings/NotificationPrefsPage";
import { QuickStartPage } from "./components/project/QuickStartPage";
import { BestsellerImportPage } from "./components/bestseller/BestsellerImportPage";
import { BestsellerAnalysisPage } from "./components/bestseller/BestsellerAnalysisPage";
import { PatternLibraryPage } from "./components/bestseller/PatternLibraryPage";
import { StyleExtractorPage } from "./components/bestseller/StyleExtractorPage";
import { BannedNamesPage } from "./components/settings/BannedNamesPage";
import { BannedTitlesPage } from "./components/settings/BannedTitlesPage";
import { CommentImportPage } from "./components/comments/CommentImportPage";
import { CommentAnalysisPage } from "./components/comments/CommentAnalysisPage";
import { StyleProfilesPage } from "./components/settings/StyleProfilesPage";
import { WritingHistoryPage } from "./components/settings/WritingHistoryPage";
import { AgentLogPage } from "./components/settings/AgentLogPage";
import { ChapterPlanningBoard } from "./components/outline/ChapterPlanningBoard";
import { VolumeStatsPage } from "./components/outline/VolumeStatsPage";
import { ChapterDependencyGraph } from "./components/outline/ChapterDependencyGraph";
import { ChapterOutlinePage } from "./components/outline/ChapterOutlinePage";
import { PromptGeneratorPage } from "./components/writer/PromptGeneratorPage";
import { RevisionTasksPage } from "./components/comments/RevisionTasksPage";
import { ExportPage } from "./components/project/ExportPage";
import { CharacterTimelinePage } from "./components/character/CharacterTimelinePage";
import { CollisionCheckerPage } from "./components/settings/CollisionCheckerPage";
import { SnapshotBrowserPage } from "./components/settings/SnapshotBrowserPage";
import { WorkflowStatusPage } from "./components/dashboard/WorkflowStatusPage";
import { ForeshadowCalendar } from "./components/dashboard/ForeshadowCalendar";
import { RetconImpactPage } from "./components/retcon/RetconImpactPage";
import { RetconWorkflowPage } from "./components/retcon/RetconWorkflowPage";
import { CommentRetconBridge } from "./components/comments/CommentRetconBridge";
import { RetconApprovalPage } from "./components/retcon/RetconApprovalPage";
import { SprintTimerPage } from "./components/writer/SprintTimerPage";
import { NameGeneratorPage } from "./components/writer/NameGeneratorPage";
import { TitleGeneratorPage } from "./components/writer/TitleGeneratorPage";
import { ReadingModePage } from "./components/chapter/ReadingModePage";
import { LocationsPage } from "./components/world/LocationsPage";
import { FactionsPage } from "./components/world/FactionsPage";
import { WorldDashboardPage } from "./components/world/WorldDashboardPage";
import { ProjectHealthReportPage } from "./components/dashboard/ProjectHealthReportPage";
import { ChapterHealthPage } from "./components/chapter/ChapterHealthPage";
import { StreakCalendar } from "./components/dashboard/StreakCalendar";
import { ProjectSettingsDetailPage } from "./components/settings/ProjectSettingsDetailPage";
import { DataManagementPage } from "./components/settings/DataManagementPage";
import { ShortcutsPage } from "./components/settings/ShortcutsPage";
import { BatchOperationsPage } from "./components/chapter/BatchOperationsPage";
import { VersionComparePage } from "./components/chapter/VersionComparePage";
import { WritingStatsDashboard } from "./components/dashboard/WritingStatsDashboard";
import { GoalsTrackerPage } from "./components/dashboard/GoalsTrackerPage";
import { ContentCalendarPage } from "./components/dashboard/ContentCalendarPage";
import { ProjectInsightsPage } from "./components/dashboard/ProjectInsightsPage";
import { RecallPanelPage } from "./components/chapter/RecallPanelPage";
import { CompilerRulesPage } from "./components/dashboard/CompilerRulesPage";
import { GlobalResourcesPage } from "./components/settings/GlobalResourcesPage";

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<BookshelfPage />} />
            <Route path="/project/:projectId" element={<AppShell />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="analytics" element={<WritingAnalytics />} />
              <Route path="compare-chapters" element={<ChapterComparePage />} />
              <Route path="retcon" element={<RetconPage />} />
              <Route path="retcon/:retconId/impact" element={<RetconImpactPage />} />
              <Route path="retcon-workflow/:retconId" element={<RetconWorkflowPage />} />
              <Route path="comment-retcon" element={<CommentRetconBridge />} />
              <Route path="retcon-approval" element={<RetconApprovalPage />} />
              <Route path="foreshadow-calendar" element={<ForeshadowCalendar />} />
              <Route path="sprint-timer" element={<SprintTimerPage />} />
              <Route path="canon" element={<CanonPage />} />
              <Route path="outline" element={<OutlinePage />} />
              <Route path="chapter-planning" element={<ChapterPlanningBoard />} />
              <Route path="volume-stats" element={<VolumeStatsPage />} />
              <Route path="chapter-dependencies" element={<ChapterDependencyGraph />} />
              <Route path="chapter/:chapterNumber" element={<ChapterWorkbench />} />
              <Route path="read/:chapterNumber" element={<ReadingModePage />} />
              <Route path="chapter-outline/:chapterNumber?" element={<ChapterOutlinePage />} />
              <Route path="prompt-generator" element={<PromptGeneratorPage />} />
              <Route path="name-generator" element={<NameGeneratorPage />} />
              <Route path="title-generator" element={<TitleGeneratorPage />} />
              <Route path="characters" element={<CharactersPage />} />
              <Route path="character/:characterId" element={<CharacterDetailPage />} />
              <Route path="character-wizard" element={<CharacterWizardPage />} />
              <Route path="ledger" element={<LedgerPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="de-ai-rules" element={<DeAiRulesPage />} />
              <Route path="soul-templates" element={<SoulTemplatesPage />} />
              <Route path="genre-templates" element={<GenreTemplatesPage />} />
              <Route path="notification-prefs" element={<NotificationPrefsPage />} />
              <Route path="bestseller/import" element={<BestsellerImportPage />} />
              <Route path="bestseller/analysis" element={<BestsellerAnalysisPage />} />
              <Route path="bestseller/patterns" element={<PatternLibraryPage />} />
              <Route path="style-extractor" element={<StyleExtractorPage />} />
              <Route path="banned-names" element={<BannedNamesPage />} />
              <Route path="banned-titles" element={<BannedTitlesPage />} />
              <Route path="comments/import" element={<CommentImportPage />} />
              <Route path="comments/analysis" element={<CommentAnalysisPage />} />
              <Route path="style-profiles" element={<StyleProfilesPage />} />
              <Route path="writing-history" element={<WritingHistoryPage />} />
              <Route path="agent-logs" element={<AgentLogPage />} />
              <Route path="comments/tasks" element={<RevisionTasksPage />} />
              <Route path="export" element={<ExportPage />} />
              <Route path="character/:characterId/timeline" element={<CharacterTimelinePage />} />
              <Route path="collision-checker" element={<CollisionCheckerPage />} />
              <Route path="snapshots" element={<SnapshotBrowserPage />} />
              <Route path="workflow-status" element={<WorkflowStatusPage />} />
              <Route path="project-health" element={<ProjectHealthReportPage />} />
              <Route path="chapter-health/:chapterNumber" element={<ChapterHealthPage />} />
              <Route path="streak-calendar" element={<StreakCalendar />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="factions" element={<FactionsPage />} />
              <Route path="world" element={<WorldDashboardPage />} />
              <Route path="project-settings" element={<ProjectSettingsDetailPage />} />
              <Route path="data-management" element={<DataManagementPage />} />
              <Route path="shortcuts" element={<ShortcutsPage />} />
              <Route path="batch-operations" element={<BatchOperationsPage />} />
              <Route path="version-compare/:chapterNumber" element={<VersionComparePage />} />
              <Route path="writing-stats" element={<WritingStatsDashboard />} />
              <Route path="goals-tracker" element={<GoalsTrackerPage />} />
              <Route path="content-calendar" element={<ContentCalendarPage />} />
              <Route path="project-insights" element={<ProjectInsightsPage />} />
              <Route path="recall-panel/:chapterNumber" element={<RecallPanelPage />} />
              <Route path="compiler-rules" element={<CompilerRulesPage />} />
              <Route path="global-resources" element={<GlobalResourcesPage />} />
            </Route>
            <Route path="/setup" element={<ProjectSetupPage />} />
            <Route path="/quick-start" element={<QuickStartPage />} />
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
