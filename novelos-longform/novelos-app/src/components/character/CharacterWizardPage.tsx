import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCharacterStore } from "../../stores";
import { ArrowLeft, ArrowRight, Check, Loader2, Users, Sparkles } from "lucide-react";

const roleLabels: Record<string, string> = {
  protagonist: "主角",
  antagonist: "反派",
  supporting: "配角",
  minor: "龙套",
};

const steps = [
  { key: "basic", label: "基本信息" },
  { key: "soul", label: "SOUL 模板" },
  { key: "review", label: "确认创建" },
];

interface SoulTemplateInfo {
  id: string;
  soul_name: string;
  category: string;
  genre_compat: string | null;
  personality_json: string;
  speech_json: string;
  behavior_json: string;
  relationships_json: string | null;
  is_builtin: boolean;
  created_at: string;
}

function parseSoulSection(json: string): Record<string, string> {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}

function SoulPreview({ template }: { template: SoulTemplateInfo }) {
  const personality = parseSoulSection(template.personality_json);
  const speech = parseSoulSection(template.speech_json);
  const behavior = parseSoulSection(template.behavior_json);

  const [activeTab, setActiveTab] = useState<"personality" | "speech" | "behavior">("personality");

  const tabs = [
    { key: "personality" as const, label: "性格" },
    { key: "speech" as const, label: "语言" },
    { key: "behavior" as const, label: "行为" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-1 border-b border-gray-200 pb-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeTab === key
                ? "text-indigo-700 bg-indigo-50 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "personality" && (
        <div className="space-y-1 text-xs">
          {Object.keys(personality).length === 0 ? (
            <p className="text-gray-400">无性格数据</p>
          ) : (
            Object.entries(personality).map(([k, v]) => (
              <p key={k}>
                <span className="text-gray-500">{k}:</span>{" "}
                <span className="text-gray-700">{String(v)}</span>
              </p>
            ))
          )}
        </div>
      )}

      {activeTab === "speech" && (
        <div className="space-y-1 text-xs">
          {Object.keys(speech).length === 0 ? (
            <p className="text-gray-400">无语言数据</p>
          ) : (
            Object.entries(speech).map(([k, v]) => (
              <p key={k}>
                <span className="text-gray-500">{k}:</span>{" "}
                <span className="text-gray-700">{String(v)}</span>
              </p>
            ))
          )}
        </div>
      )}

      {activeTab === "behavior" && (
        <div className="space-y-1 text-xs">
          {Object.keys(behavior).length === 0 ? (
            <p className="text-gray-400">无行为数据</p>
          ) : (
            Object.entries(behavior).map(([k, v]) => (
              <p key={k}>
                <span className="text-gray-500">{k}:</span>{" "}
                <span className="text-gray-700">{String(v)}</span>
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function CharacterWizardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { create } = useCharacterStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Basic Info
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState("supporting");
  const [identityCore, setIdentityCore] = useState("");
  const [coreMotivation, setCoreMotivation] = useState("");

  // Step 2: SOUL Template
  const [templates, setTemplates] = useState<SoulTemplateInfo[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const { templateApi } = await import("../../lib/tauri");
      const result = await templateApi.listSoulTemplates();
      setTemplates(result);
    } catch {
      setError("加载SOUL模板失败");
    }
    setTemplatesLoading(false);
  };

  const canProceedStep1 = name.trim().length > 0;
  const canProceedStep2 = selectedTemplateId !== "";

  const handleNext = () => {
    if (currentStep === 0 && !canProceedStep1) return;
    if (currentStep === 1 && !canProceedStep2) return;
    setCurrentStep(Math.min(steps.length - 1, currentStep + 1));
  };

  const handleBack = () => {
    setCurrentStep(Math.max(0, currentStep - 1));
  };

  const buildSoulJson = (): string => {
    if (!selectedTemplate) return "{}";
    const soulData = {
      matched_template: selectedTemplate.soul_name,
      customization: {
        personality: parseSoulSection(selectedTemplate.personality_json),
        speech: parseSoulSection(selectedTemplate.speech_json),
        behavior: parseSoulSection(selectedTemplate.behavior_json),
        relationships: selectedTemplate.relationships_json
          ? JSON.parse(selectedTemplate.relationships_json)
          : {},
      },
    };
    return JSON.stringify(soulData, null, 2);
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const soulJson = buildSoulJson();
      const character = await create(name.trim(), roleType, soulJson);
      if (character) {
        navigate(`/project/${projectId}/character/${character.id}`);
      } else {
        setError("创建角色失败，请重试");
      }
    } catch {
      setError("创建角色失败");
    }
    setCreating(false);
  };

  const goToCharacters = () => {
    navigate(`/project/${projectId}/characters`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={goToCharacters} className="p-2 hover:bg-gray-200 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-indigo-600" />
            角色创建向导
          </h1>
        </div>

        {/* Step indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">
              步骤 {currentStep + 1} / {steps.length}: {steps[currentStep].label}
            </h2>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-center gap-0 mt-4">
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-center">
                <button
                  onClick={() => {
                    // Allow going back to completed steps
                    if (i < currentStep || (i === 0 && currentStep === 0)) {
                      setCurrentStep(i);
                    }
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      i < currentStep
                        ? "bg-green-500 text-white shadow-sm"
                        : i === currentStep
                          ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i < currentStep ? <Check size={14} /> : i + 1}
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 whitespace-nowrap ${
                      i <= currentStep ? "text-indigo-600 font-medium" : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {i < steps.length - 1 && (
                  <div className="w-12 h-0.5 mx-1 mt-[-14px] rounded bg-gray-200">
                    <div
                      className="h-full rounded bg-indigo-600 transition-all"
                      style={{ width: i < currentStep ? "100%" : "0%" }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step content */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 min-h-[400px]">
          {/* Step 1: Basic Info */}
          {currentStep === 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">基本信息</h2>
              <p className="text-gray-500 text-sm mb-4">填写角色的基本身份信息和核心设定。</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    角色名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="输入角色名..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">角色类型</label>
                  <select
                    value={roleType}
                    onChange={(e) => setRoleType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="protagonist">{roleLabels.protagonist}</option>
                    <option value="antagonist">{roleLabels.antagonist}</option>
                    <option value="supporting">{roleLabels.supporting}</option>
                    <option value="minor">{roleLabels.minor}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">身份核心</label>
                  <textarea
                    value={identityCore}
                    onChange={(e) => setIdentityCore(e.target.value)}
                    placeholder="例如：宗门大弟子、市井孤儿、神秘旅者..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">核心动机</label>
                  <textarea
                    value={coreMotivation}
                    onChange={(e) => setCoreMotivation(e.target.value)}
                    placeholder="例如：复仇、守护家人、寻找真相、追求力量..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: SOUL Template */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">SOUL 模板</h2>
              <p className="text-gray-500 text-sm mb-4">
                选择一个 SOUL 性格模板来为角色赋予性格、语言和行为模式。
              </p>

              {templatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">暂无可用模板</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {templates.map((tmpl) => {
                    const isSelected = selectedTemplateId === tmpl.id;
                    return (
                      <button
                        key={tmpl.id}
                        onClick={() => setSelectedTemplateId(tmpl.id)}
                        className={`text-left p-4 rounded-lg border transition-all ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900">{tmpl.soul_name}</span>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {tmpl.category}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="mt-3 border-t border-indigo-200 pt-3">
                            <p className="text-xs text-gray-500 mb-2">模板预览:</p>
                            <SoulPreview template={tmpl} />
                          </div>
                        )}
                        {!isSelected && (
                          <p className="text-xs text-gray-400 mt-1">点击选择以预览模板详情</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">确认创建</h2>
              <p className="text-gray-500 text-sm mb-4">
                检查以下信息，确认无误后点击「创建角色」。
              </p>

              <div className="space-y-4">
                {/* Basic info summary */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Users size={16} className="text-indigo-600" />
                    基本信息
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">角色名:</span>
                      <span className="ml-2 text-gray-900 font-medium">{name || "（未填写）"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">角色类型:</span>
                      <span className="ml-2 text-gray-900">{roleLabels[roleType] || roleType}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500">身份核心:</span>
                      <p className="text-gray-900 mt-0.5">{identityCore || "（未填写）"}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500">核心动机:</span>
                      <p className="text-gray-900 mt-0.5">{coreMotivation || "（未填写）"}</p>
                    </div>
                  </div>
                </div>

                {/* SOUL template summary */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Sparkles size={16} className="text-purple-600" />
                    SOUL 模板
                  </h3>
                  {selectedTemplate ? (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-medium text-gray-900">
                          {selectedTemplate.soul_name}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                          {selectedTemplate.category}
                        </span>
                      </div>
                      <SoulPreview template={selectedTemplate} />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">未选择模板</p>
                  )}
                </div>
              </div>

              {/* Create button */}
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim() || !selectedTemplateId}
                className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-base font-medium transition-colors"
              >
                {creating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    创建角色
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={handleBack}
            disabled={currentStep === 0 || creating}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <ArrowLeft size={16} />
            上一步
          </button>

          {currentStep < steps.length - 1 && (
            <button
              onClick={handleNext}
              disabled={
                (currentStep === 0 && !canProceedStep1) || (currentStep === 1 && !canProceedStep2)
              }
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              下一步
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
