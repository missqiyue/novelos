import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Wand2, Rocket, ArrowRight, Check, Gift } from "lucide-react";

const STORAGE_KEY = "novelos_onboarding_complete";

const steps = [
 {
 icon: BookOpen,
 title: "欢迎来到 NovelOS Longform",
 desc: "AI驱动的长篇小说创作系统。我们将用3步帮你创建第一本小说。",
 },
 {
 icon: Wand2,
 title: "选择开始方式",
 desc: "你可以从头创建新作品，也可以导入已有稿件，或者直接体验示例项目。",
 },
 {
 icon: Rocket,
 title: "开始创作",
 desc: "项目创建后，你可以使用一键启动流程让AI帮你规划全书框架，或者直接开始写作。",
 },
];

export function WelcomeWizard({ onComplete }: { onComplete: () => void }) {
 const [step, setStep] = useState(0);
 const navigate = useNavigate();

 const finish = () => {
 try {
 localStorage.setItem(STORAGE_KEY, "true");
 } catch {}
 onComplete();
 };

 return (
 <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
 <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
 {/* Progress */}
 <div className="flex gap-1 px-6 pt-6">
 {steps.map((_, i) => (
 <div
 key={i}
 className={`flex-1 h-1 rounded-full transition-colors ${
 i <= step ? "bg-indigo-600" : "bg-gray-200"
 }`}
 />
 ))}
 </div>

 {/* Content */}
 <div className="p-8 text-center">
 {(() => {
 const S = steps[step];
 return (
 <>
 <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
 <S.icon size={28} className="text-indigo-600" />
 </div>
 <h2 className="text-xl font-bold text-gray-900 mb-2">
 {S.title}
 </h2>
 <p className="text-gray-500 text-sm leading-relaxed">{S.desc}</p>
 </>
 );
 })()}

 {/* Step 2: Action buttons */}
 {step === 1 && (
 <div className="mt-6 space-y-2">
 <button
 onClick={() => {
 finish();
 navigate("/");
 }}
 className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-left text-sm"
 >
 <span className="flex items-center gap-2">
 <BookOpen size={16} />
 创建新作品
 </span>
 <ArrowRight size={14} />
 </button>
 <button
 onClick={async () => {
 try {
 const { projectApi } = await import("../../lib/tauri");
 const r = await projectApi.createSample();
 alert(
 `示例项目「星辰仙途」已创建！\n${r.volumes_created}卷 ${r.characters_created}角色`,
 );
 finish();
 navigate(`/project/${r.project_id}/dashboard`);
 } catch (e: any) {
 alert("创建失败: " + e);
 }
 }}
 className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 text-left text-sm"
 >
 <span className="flex items-center gap-2">
 <Gift size={16} />
 体验示例项目「星辰仙途」
 </span>
 <ArrowRight size={14} />
 </button>
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="flex items-center justify-between px-8 pb-6">
 {step > 0 ? (
 <button
 onClick={() => setStep(step - 1)}
 className="text-sm text-gray-400 hover:text-gray-600"
 >
 上一步
 </button>
 ) : (
 <div />
 )}
 {step < steps.length - 1 ? (
 <button
 onClick={() => setStep(step + 1)}
 className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
 >
 继续 <ArrowRight size={14} />
 </button>
 ) : (
 <button
 onClick={finish}
 className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
 >
 <Check size={14} /> 开始使用
 </button>
 )}
 </div>
 </div>
 </div>
 );
}

export function useOnboarding() {
 const [show, setShow] = useState(false);

 useEffect(() => {
 try {
 if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
 } catch {}
 }, []);

 return { show, complete: () => setShow(false) };
}
