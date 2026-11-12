"use strict";

/*
 * 热流指挥官 · 换热站危机
 * ------------------------------------------------------------
 * 课程知识点：化工原理第四章第 4-5 课
 * 1. 通过热量守恒与 ε-NTU 关系计算冷、热流体出口温度；
 * 2. 用总面积、流量、污垢热阻和强化传热修正总传热系数；
 * 3. 将泵耗纳入评价，体现“强化传热并非免费”的工程权衡。
 *
 * 该模型为教学简化模型，用于课堂互动，不替代工程设计计算。
 */

const PHYSICS = Object.freeze({
  hotInlet: 125,
  coldInlet: 25,
  hotCp: 2.1,
  coldCp: 4.18,
  baseUa: 4.2,
  pumpBase: 0.8,
  pumpFlowFactor: 9.5,
  pumpAreaFactor: 1.8,
  pumpEnhancementCost: 2.2
});

const MISSIONS = [
  {
    id: 1,
    label: "稳态启动",
    title: "让热量找到正确的方向",
    objective: "选择逆流布置，使冷流体出口达到 66–70°C",
    shortObjective: "冷流体出口 66–70°C，并切换为逆流",
    scenario:
      "夜班刚接班，冷流体出口温度偏低。设备允许切换并流或逆流，但本班次不再调整流量和面积。先判断哪一种流向更适合升温。",
    hint:
      "比较冷热流体同向流动与反向流动时的平均传热温差。冷热端温差更均匀，通常意味着更大的传热推动力。",
    formula: "逆流 · 平均温差 · 能量守恒",
    init: {
      hotFlow: 1.2,
      coldFlow: 1,
      area: 1,
      fouling: 0.05,
      enhancement: false,
      counterflow: false
    },
    locked: ["hotFlow", "coldFlow", "area", "enhancement", "cleaning"],
    target: {
      minTemp: 66,
      maxTemp: 70,
      maxPump: 13.5,
      requireCounterflow: true
    },
    theory:
      "逆流时冷端和热端的温差更均匀，平均传热温差通常大于并流。因此在相同换热面积和流量下，冷流体更容易达到较高出口温度。",
    bestDecision: "逆流布置扩大了有效平均传热温差。",
    improvement: "设备固定时，盲目提高流量会增加泵耗，却未必最有效。"
  },
  {
    id: 2,
    label: "负荷调节",
    title: "把温度稳定在工艺窗口",
    objective: "冷流体出口控制在 72–76°C，泵耗 ≤ 12.8 kW",
    shortObjective: "出口温度 72–76°C；泵耗 ≤ 12.8 kW",
    scenario:
      "下游反应器要求预热温度落在 72–76°C。冷凝水泵送能力有限，你只能在流量和有效面积之间寻找平衡。",
    hint:
      "热流体流量增加，会带来更多可用热量；冷流体流量降低，则单千克流体升温更明显。注意两者都会改变泵耗。",
    formula: "Q = m·cₚ·ΔT · 运行能耗",
    init: {
      hotFlow: 1.12,
      coldFlow: 1.28,
      area: 0.82,
      fouling: 0.05,
      enhancement: false,
      counterflow: true
    },
    locked: ["enhancement", "cleaning"],
    target: {
      minTemp: 72,
      maxTemp: 76,
      maxPump: 12.8,
      requireCounterflow: false
    },
    theory:
      "冷流体吸收的热量 Q=mcₚ(Tout−Tin)。在热量一定时，降低冷流体流量会使出口温度升高；增加热流体流量则能提供更多热量，但同时影响两侧热容和泵耗。",
    bestDecision: "通过流量与面积组合，把温度稳定在工艺窗口。",
    improvement: "不要只追求高温，越过工艺窗口同样会造成运行风险。"
  },
  {
    id: 3,
    label: "污垢危机",
    title: "总传热系数正在下降",
    objective: "处理污垢影响，使出口达到 70–74°C",
    shortObjective: "出口 70–74°C；泵耗 ≤ 13.2 kW",
    scenario:
      "连续运行后，管壁附着物增多，总传热系数明显下降。在线清洗能恢复性能，但会影响本班次的连续运行评价。",
    hint:
      "污垢层相当于额外热阻。在线清洗会降低污垢热阻，使 K 和 Q 上升；如果只提高流量，泵耗也会迅速增加。",
    formula: "串联热阻 · K↓ → Q↓ · 在线清洗",
    init: {
      hotFlow: 1.28,
      coldFlow: 1.18,
      area: 0.98,
      fouling: 0.32,
      enhancement: false,
      counterflow: true
    },
    locked: ["enhancement"],
    target: {
      minTemp: 70,
      maxTemp: 74,
      maxPump: 13.2,
      requireCounterflow: false,
      maxFouling: 0.12
    },
    theory:
      "污垢层、管壁和两侧对流换热共同构成串联热阻。污垢热阻增大会使总传热系数 K 下降，在温差和面积不变时，传热速率 Q 也随之降低。",
    bestDecision: "及时清除污垢热阻，恢复了设备传热能力。",
    improvement: "污垢是渐进过程，稳定运行比事后大幅提流量更节能。"
  },
  {
    id: 4,
    label: "强化传热",
    title: "让 K 提升，但别让泵先投降",
    objective: "在泵耗 ≤ 13.8 kW 下维持出口 80–84°C",
    shortObjective: "出口 80–84°C；泵耗 ≤ 13.8 kW",
    scenario:
      "生产负荷提高，原有换热能力不足。设备可以投用扰流强化组件，但流动阻力会同步增加。",
    hint:
      "先投用强化传热提高 K，再小幅调节流量。强化传热的价值不是“越高越好”，而是用可接受的泵耗换来足够的热量。",
    formula: "强化传热 · K↑ / P↑ · 性能评价",
    init: {
      hotFlow: 1.34,
      coldFlow: 0.86,
      area: 0.78,
      fouling: 0.08,
      enhancement: false,
      counterflow: true
    },
    locked: ["cleaning"],
    target: {
      minTemp: 80,
      maxTemp: 84,
      maxPump: 13.8,
      requireCounterflow: false,
      requireEnhancement: true
    },
    theory:
      "扰流元件能破坏边界层、提高表面传热系数，从而提高 K。但强化元件也会增大流动阻力，泵耗随流量快速上升，因此必须做综合性能评价。",
    bestDecision: "用强化传热提升了 K，而非单纯堆高流量。",
    improvement: "强化传热要以可接受的压降和泵耗为前提。"
  },
  {
    id: 5,
    label: "峰值调度",
    title: "最后一小时，系统已没有余量",
    objective: "出口达到 77–79°C，同时泵耗 ≤ 14.5 kW",
    shortObjective: "出口 77–79°C；泵耗 ≤ 14.5 kW",
    scenario:
      "交班前最后一小时，下游临时提高需求。污垢、流量和强化传热都还有调节空间，但工艺窗口更窄，泵送系统也接近上限。",
    hint:
      "本关没有唯一解。先清洗、再判断是否需要强化传热，最后细调冷热流量。关注温度是否只在目标区间两端徘徊。",
    formula: "综合调度 · 传热速率 · 泵耗预算",
    init: {
      hotFlow: 1.23,
      coldFlow: 1.05,
      area: 0.92,
      fouling: 0.22,
      enhancement: false,
      counterflow: true
    },
    locked: [],
    target: {
      minTemp: 77,
      maxTemp: 79,
      maxPump: 14.5,
      requireCounterflow: false,
      maxFouling: 0.08
    },
    theory:
      "换热器运行是传热能力、流体输送能耗与设备状态之间的综合优化。温度、泵耗和清污成本必须同时满足，不能把某一个指标推到极限。",
    bestDecision: "在狭窄工艺窗口内完成了温度与泵耗的综合平衡。",
    improvement: "结束高负荷任务后，应检查污垢增长与强化元件的压降变化。"
  }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;

const dom = {
  startScreen: $("#startScreen"),
  gameScreen: $("#gameScreen"),
  settlementScreen: $("#settlementScreen"),
  startBtn: $("#startBtn"),
  startHelpBtn: $("#startHelpBtn"),
  soundBtn: $("#soundBtn"),
  formulaBtn: $("#formulaBtn"),
  pauseBtn: $("#pauseBtn"),
  missionCounter: $("#missionCounter"),
  progressPercent: $("#progressPercent"),
  progressBar: $("#progressBar"),
  missionNumber: $("#missionNumber"),
  missionLabel: $("#missionLabel"),
  missionTitle: $("#missionTitle"),
  missionObjective: $("#missionObjective"),
  consoleObjective: $("#consoleObjective"),
  restartMissionBtn: $("#restartMissionBtn"),
  systemStatus: $("#systemStatus"),
  canvas: $("#exchangerCanvas"),
  scanOverlay: $("#scanOverlay"),
  coldOutValue: $("#coldOutValue"),
  coldOutGauge: $("#coldOutGauge"),
  targetZone: $("#targetZone"),
  heatValue: $("#heatValue"),
  heatTrend: $("#heatTrend"),
  pumpValue: $("#pumpValue"),
  pumpLimit: $("#pumpLimit"),
  kValue: $("#kValue"),
  foulingState: $("#foulingState"),
  hotFlow: $("#hotFlow"),
  coldFlow: $("#coldFlow"),
  areaFactor: $("#areaFactor"),
  hotFlowOutput: $("#hotFlowOutput"),
  coldFlowOutput: $("#coldFlowOutput"),
  areaOutput: $("#areaOutput"),
  parallelBtn: $("#parallelBtn"),
  counterBtn: $("#counterBtn"),
  turbulatorBtn: $("#turbulatorBtn"),
  cleanBtn: $("#cleanBtn"),
  cleanHint: $("#cleanHint"),
  cleanCount: $("#cleanCount"),
  submitBtn: $("#submitBtn"),
  modalBackdrop: $("#modalBackdrop"),
  briefingModal: $("#briefingModal"),
  resultModal: $("#resultModal"),
  formulaModal: $("#formulaModal"),
  pauseModal: $("#pauseModal"),
  reportModal: $("#reportModal"),
  briefingEyebrow: $("#briefingEyebrow"),
  briefingTitle: $("#briefingTitle"),
  briefingNumber: $("#briefingNumber"),
  briefingScenario: $("#briefingScenario"),
  briefingObjective: $("#briefingObjective"),
  briefingHint: $("#briefingHint"),
  briefingFormula: $("#briefingFormula"),
  briefingCloseBtn: $("#briefingCloseBtn"),
  briefingStartBtn: $("#briefingStartBtn"),
  resultIcon: $("#resultIcon"),
  resultEyebrow: $("#resultEyebrow"),
  resultTitle: $("#resultTitle"),
  resultDescription: $("#resultDescription"),
  resultScore: $("#resultScore"),
  resultTemp: $("#resultTemp"),
  resultPump: $("#resultPump"),
  resultTheory: $("#resultTheory"),
  retryBtn: $("#retryBtn"),
  nextBtn: $("#nextBtn"),
  continueBtn: $("#continueBtn"),
  pauseRestartBtn: $("#pauseRestartBtn"),
  settlementSubtitle: $("#settlementSubtitle"),
  gradeLetter: $("#gradeLetter"),
  finalScore: $("#finalScore"),
  gradeComment: $("#gradeComment"),
  tempScore: $("#tempScore"),
  energyScore: $("#energyScore"),
  principleScore: $("#principleScore"),
  tempMetricBar: $("#tempMetricBar"),
  energyMetricBar: $("#energyMetricBar"),
  principleMetricBar: $("#principleMetricBar"),
  bestDecision: $("#bestDecision"),
  improvementText: $("#improvementText"),
  reportSerial: $("#reportSerial"),
  replayBtn: $("#replayBtn"),
  viewReportBtn: $("#viewReportBtn"),
  skipSettlementBtn: $("#skipSettlementBtn"),
  reportTable: $("#reportTable"),
  reportReplayBtn: $("#reportReplayBtn"),
  toast: $("#toast"),
  liveRegion: $("#liveRegion"),
  settlementCanvas: $("#settlementCanvas")
};

const state = {
  screen: "start",
  missionIndex: 0,
  params: null,
  metrics: null,
  cleanUses: 1,
  soundEnabled: true,
  running: false,
  submitting: false,
  modal: null,
  runRecords: [],
  settlementTimer: null,
  globalTime: 0
};

const particles = Array.from({ length: 78 }, (_, index) => ({
  progress: Math.random(),
  speed: 0.055 + Math.random() * 0.11,
  type: index % 7 === 0 ? "heat" : index % 4 === 0 ? "hot" : "cold",
  lane: index % 7,
  wobble: Math.random() * Math.PI * 2,
  size: 1.2 + Math.random() * 2.1
}));

const heatWisps = Array.from({ length: 24 }, () => ({
  x: Math.random(),
  y: Math.random(),
  phase: Math.random() * Math.PI * 2,
  speed: 0.08 + Math.random() * 0.12,
  size: 10 + Math.random() * 28
}));

let audioContext = null;
let canvasSize = { width: 1000, height: 520, scale: 1 };
let settlementParticles = [];
let settlementStart = 0;

function calculateMetrics(params) {
  const Ch = params.hotFlow * PHYSICS.hotCp;
  const Cc = params.coldFlow * PHYSICS.coldCp;
  const area = params.area;
  const cleanFactor = Math.max(0.38, 1 - params.fouling);
  const enhancementFactor = params.enhancement ? 1.32 : 1;
  const UA =
    PHYSICS.baseUa *
    area *
    Math.pow(params.coldFlow, 0.55) *
    cleanFactor *
    enhancementFactor;

  const Cmin = Math.min(Ch, Cc);
  const Cmax = Math.max(Ch, Cc);
  const Cr = Cmin / Cmax;
  const NTU = UA / Cmin;
  let effectiveness;

  if (params.counterflow) {
    const expTerm = Math.exp(-NTU * (1 - Cr));
    effectiveness =
      Math.abs(Cr - 1) < 0.0001
        ? NTU / (1 + NTU)
        : (1 - expTerm) / (1 - Cr * expTerm);
  } else {
    effectiveness =
      (1 - Math.exp(-NTU * (1 + Cr))) / (1 + Cr);
  }

  const Qmax = Cmin * (PHYSICS.hotInlet - PHYSICS.coldInlet);
  const Q = Qmax * clamp(effectiveness, 0, 1);
  const hotOut = PHYSICS.hotInlet - Q / Ch;
  const coldOut = PHYSICS.coldInlet + Q / Cc;
  const pump =
    PHYSICS.pumpBase +
    PHYSICS.pumpFlowFactor * Math.pow(params.coldFlow, 3) +
    PHYSICS.pumpAreaFactor * area +
    (params.enhancement ? PHYSICS.pumpEnhancementCost : 0);

  return {
    Q,
    UA,
    K: UA / area,
    effectiveness,
    NTU,
    hotOut,
    coldOut,
    pump,
    capacityHot: Ch,
    capacityCold: Cc
  };
}

function evaluateMission() {
  const mission = MISSIONS[state.missionIndex];
  const target = mission.target;
  const metrics = state.metrics;
  const tempPass = metrics.coldOut >= target.minTemp && metrics.coldOut <= target.maxTemp;
  const pumpPass = metrics.pump <= target.maxPump;
  const directionPass = !target.requireCounterflow || state.params.counterflow;
  const enhancementPass = !target.requireEnhancement || state.params.enhancement;
  const foulingPass =
    target.maxFouling === undefined || state.params.fouling <= target.maxFouling;
  const passed = tempPass && pumpPass && directionPass && enhancementPass && foulingPass;

  const targetCenter = (target.minTemp + target.maxTemp) / 2;
  const targetHalf = (target.maxTemp - target.minTemp) / 2;
  const tempError = Math.max(0, Math.abs(metrics.coldOut - targetCenter) - targetHalf);
  const tempScore = clamp(100 - tempError * 18, 0, 100);
  const pumpScore = clamp(
    100 - Math.max(0, metrics.pump - target.maxPump * 0.72) * 11,
    0,
    100
  );
  const principleChecks = [directionPass, enhancementPass, foulingPass];
  const principleScore = clamp(
    principleChecks.filter(Boolean).length * 30 + (tempPass ? 10 : 0),
    0,
    100
  );
  const score = Math.round(
    tempScore * 0.5 + pumpScore * 0.25 + principleScore * 0.25
  );

  return {
    passed,
    tempPass,
    pumpPass,
    directionPass,
    enhancementPass,
    foulingPass,
    tempScore,
    pumpScore,
    principleScore,
    score
  };
}

function getMissionParams(mission) {
  return { ...mission.init };
}

function formatNumber(value, digits = 1) {
  return Number(value).toFixed(digits);
}

function setRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const percent = ((value - min) / (max - min)) * 100;
  input.style.setProperty("--fill", `${percent}%`);
}

function updateControlValues() {
  if (!state.params) return;
  dom.hotFlow.value = state.params.hotFlow.toFixed(2);
  dom.coldFlow.value = state.params.coldFlow.toFixed(2);
  dom.areaFactor.value = state.params.area.toFixed(2);
  dom.hotFlowOutput.textContent = `${state.params.hotFlow.toFixed(2)} kg/s`;
  dom.coldFlowOutput.textContent = `${state.params.coldFlow.toFixed(2)} kg/s`;
  dom.areaOutput.textContent = `${Math.round(state.params.area * 100)}%`;
  [dom.hotFlow, dom.coldFlow, dom.areaFactor].forEach(setRangeFill);

  dom.parallelBtn.classList.toggle("is-active", !state.params.counterflow);
  dom.counterBtn.classList.toggle("is-active", state.params.counterflow);
  dom.parallelBtn.setAttribute("aria-pressed", String(!state.params.counterflow));
  dom.counterBtn.setAttribute("aria-pressed", String(state.params.counterflow));

  dom.turbulatorBtn.classList.toggle("is-active", state.params.enhancement);
  dom.turbulatorBtn.setAttribute("aria-pressed", String(state.params.enhancement));
  dom.cleanHint.textContent =
    state.params.fouling < 0.08
      ? "当前污垢已处于低水平"
      : `当前污垢热阻 ${Math.round(state.params.fouling * 100)}%`;
}

function setControlsLocked() {
  const mission = MISSIONS[state.missionIndex];
  const locked = new Set(mission.locked);
  dom.hotFlow.disabled = locked.has("hotFlow") || state.submitting;
  dom.coldFlow.disabled = locked.has("coldFlow") || state.submitting;
  dom.areaFactor.disabled = locked.has("area") || state.submitting;
  dom.turbulatorBtn.disabled = locked.has("enhancement") || state.submitting;
  dom.parallelBtn.disabled = false;
  dom.counterBtn.disabled = false;
  dom.cleanBtn.disabled =
    locked.has("cleaning") ||
    state.submitting ||
    state.cleanUses <= 0 ||
    state.params.fouling < 0.045;
  dom.submitBtn.disabled = state.submitting;
  dom.cleanCount.textContent = `× ${state.cleanUses}`;
}

function renderMetrics() {
  const mission = MISSIONS[state.missionIndex];
  const target = mission.target;
  const metrics = calculateMetrics(state.params);
  state.metrics = metrics;

  dom.coldOutValue.textContent = formatNumber(metrics.coldOut, 1);
  dom.heatValue.textContent = formatNumber(metrics.Q, 1);
  dom.pumpValue.textContent = formatNumber(metrics.pump, 1);
  dom.kValue.textContent = formatNumber(metrics.K, 2);
  dom.pumpLimit.textContent = `上限 ${formatNumber(target.maxPump, 1)} kW`;
  dom.foulingState.textContent = `污垢热阻 ${Math.round(state.params.fouling * 100)}%`;
  dom.heatTrend.textContent =
    metrics.effectiveness > 0.72
      ? "传热能力接近上限"
      : metrics.effectiveness > 0.55
        ? "能量传递保持稳定"
        : "传热温差仍有空间";

  const tempPercent = clamp((metrics.coldOut - 20) / 70, 0, 1) * 100;
  dom.coldOutGauge.style.width = `${tempPercent}%`;

  const zoneLeft = clamp((target.minTemp - 20) / 70, 0, 1) * 100;
  const zoneWidth =
    clamp((target.maxTemp - target.minTemp) / 70, 0.01, 1) * 100;
  dom.targetZone.style.left = `${zoneLeft}%`;
  dom.targetZone.style.width = `${zoneWidth}%`;

  const tempInRange =
    metrics.coldOut >= target.minTemp && metrics.coldOut <= target.maxTemp;
  const pumpInRange = metrics.pump <= target.maxPump;
  dom.coldOutValue.style.color = tempInRange ? "var(--green)" : "var(--text)";
  dom.pumpValue.style.color = pumpInRange ? "var(--text)" : "var(--red)";

  if (!pumpInRange) {
    dom.systemStatus.className = "status-chip status-danger";
    dom.systemStatus.innerHTML = "<span></span>泵耗超限";
  } else if (!tempInRange) {
    dom.systemStatus.className = "status-chip status-warning";
    dom.systemStatus.innerHTML = "<span></span>温度偏移";
  } else {
    dom.systemStatus.className = "status-chip status-running";
    dom.systemStatus.innerHTML = "<span></span>运行中";
  }
}

function updateAll() {
  updateControlValues();
  renderMetrics();
  setControlsLocked();
}

function loadMission(index, showBriefing = true) {
  state.missionIndex = index;
  state.cleanUses = 1;
  state.submitting = false;
  state.params = getMissionParams(MISSIONS[index]);
  const mission = MISSIONS[index];

  dom.missionCounter.textContent = `任务 ${String(index + 1).padStart(2, "0")} / 05`;
  dom.progressPercent.textContent = `${Math.round((index / 5) * 100)}%`;
  dom.progressBar.style.width = `${(index / 5) * 100}%`;
  dom.missionNumber.textContent = String(index + 1).padStart(2, "0");
  dom.missionLabel.textContent = mission.label;
  dom.missionTitle.textContent = mission.title;
  dom.missionObjective.textContent = mission.shortObjective;
  dom.consoleObjective.textContent = mission.shortObjective;

  updateAll();

  if (showBriefing) {
    showBriefingModal();
  }
}

function showBriefingModal() {
  const mission = MISSIONS[state.missionIndex];
  dom.briefingEyebrow.textContent = `MISSION ${String(mission.id).padStart(2, "0")} · BRIEFING`;
  dom.briefingTitle.textContent = mission.label;
  dom.briefingNumber.textContent = String(mission.id).padStart(2, "0");
  dom.briefingScenario.textContent = mission.scenario;
  dom.briefingObjective.textContent = `任务目标：${mission.objective}`;
  dom.briefingHint.textContent = mission.hint;
  dom.briefingFormula.textContent = mission.formula;
  dom.briefingCloseBtn.hidden = false;
  dom.briefingStartBtn.textContent = "开始调节";
  openModal("briefing");
}

function openModal(type) {
  state.modal = type;
  dom.modalBackdrop.hidden = false;
  [dom.briefingModal, dom.resultModal, dom.formulaModal, dom.pauseModal, dom.reportModal].forEach(
    (modal) => {
      modal.hidden = true;
    }
  );

  const modalMap = {
    briefing: dom.briefingModal,
    result: dom.resultModal,
    formula: dom.formulaModal,
    pause: dom.pauseModal,
    report: dom.reportModal
  };
  modalMap[type].hidden = false;

  const focusTarget = modalMap[type].querySelector("button:not([disabled])");
  window.setTimeout(() => focusTarget?.focus(), 50);
}

function closeModal() {
  dom.modalBackdrop.hidden = true;
  state.modal = null;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    dom.toast.classList.remove("is-visible");
  }, 1800);
}

function announce(message) {
  dom.liveRegion.textContent = "";
  window.setTimeout(() => {
    dom.liveRegion.textContent = message;
  }, 30);
}

function ensureAudio() {
  if (!state.soundEnabled || audioContext) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  audioContext = new AudioCtor();
}

function playTone({
  frequency = 440,
  duration = 0.1,
  gain = 0.035,
  type = "sine",
  delay = 0
}) {
  if (!state.soundEnabled) return;
  ensureAudio();
  if (!audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  const now = audioContext.currentTime + delay;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  volume.gain.setValueAtTime(0, now);
  volume.gain.linearRampToValueAtTime(gain, now + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(volume);
  volume.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playClick() {
  playTone({ frequency: 520, duration: 0.055, gain: 0.018, type: "triangle" });
}

function playSuccess() {
  playTone({ frequency: 392, duration: 0.18, gain: 0.035, type: "sine" });
  playTone({ frequency: 523.25, duration: 0.22, gain: 0.03, delay: 0.11 });
  playTone({ frequency: 659.25, duration: 0.32, gain: 0.026, delay: 0.23 });
}

function playFailure() {
  playTone({ frequency: 220, duration: 0.22, gain: 0.03, type: "triangle" });
  playTone({ frequency: 174.61, duration: 0.35, gain: 0.026, type: "triangle", delay: 0.12 });
}

function playSettlement() {
  const notes = [261.63, 329.63, 392, 523.25, 659.25];
  notes.forEach((frequency, index) => {
    playTone({
      frequency,
      duration: 0.55,
      gain: index === notes.length - 1 ? 0.035 : 0.022,
      type: "sine",
      delay: index * 0.14
    });
  });
  playTone({ frequency: 98, duration: 1.1, gain: 0.02, type: "triangle" });
}

function submitMission() {
  if (state.submitting) return;
  state.submitting = true;
  setControlsLocked();
  dom.scanOverlay.hidden = false;
  dom.scanOverlay.querySelector("span").textContent = "正在校核传热模型";
  playClick();

  window.setTimeout(() => {
    const result = evaluateMission();
    const mission = MISSIONS[state.missionIndex];
    dom.scanOverlay.hidden = true;
    state.submitting = false;
    setControlsLocked();
    showResult(result);

    if (result.passed) {
      state.runRecords[state.missionIndex] = {
        id: mission.id,
        label: mission.label,
        coldOut: state.metrics.coldOut,
        pump: state.metrics.pump,
        score: result.score
      };
      playSuccess();
    } else {
      playFailure();
    }
  }, 1050);
}

function buildFailureDescription(result) {
  const target = MISSIONS[state.missionIndex].target;
  if (!result.directionPass) return "流向选择没有提供足够大的平均传热温差。请比较并流与逆流后的出口温度。";
  if (!result.enhancementPass) return "当前 K 不足以完成高负荷任务。试试投用强化传热组件。";
  if (!result.foulingPass) return "污垢热阻仍然过高，设备没有恢复到目标传热能力。";
  if (!result.tempPass && state.metrics.coldOut < target.minTemp)
    return "冷流体出口温度偏低。可增加可用热量、降低冷流体流量，或提高 K。";
  if (!result.tempPass && state.metrics.coldOut > target.maxTemp)
    return "冷流体出口温度过高，已经越过工艺上限。适当降低热负荷或调整流量。";
  if (!result.pumpPass) return "温度虽然接近目标，但泵耗超过上限。优先选择低阻力方案。";
  return "运行指标尚未同时满足任务条件。请结合知识手册重新调节。";
}

function showResult(result) {
  const mission = MISSIONS[state.missionIndex];
  dom.resultIcon.classList.toggle("is-failed", !result.passed);
  dom.resultIcon.innerHTML = result.passed
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"></path></svg>';
  dom.resultEyebrow.textContent = result.passed ? "SHIFT VERIFIED" : "CHECK REQUIRED";
  dom.resultTitle.textContent = result.passed ? "运行校验通过" : "方案需要复核";
  dom.resultDescription.textContent = result.passed
    ? "温度、泵耗和传热原理检查均已通过。系统已记录本班次运行结果。"
    : buildFailureDescription(result);
  dom.resultScore.textContent = result.score;
  dom.resultTemp.textContent = `${formatNumber(state.metrics.coldOut, 1)}°C`;
  dom.resultPump.textContent = `${formatNumber(state.metrics.pump, 1)}kW`;
  dom.resultTheory.textContent = mission.theory;
  dom.retryBtn.hidden = result.passed;
  dom.nextBtn.hidden = !result.passed;
  dom.resultModal.querySelector(".result-actions").style.justifyContent = result.passed
    ? "center"
    : "center";
  dom.nextBtn.textContent =
    state.missionIndex === MISSIONS.length - 1 ? "生成运行结算" : "进入下一任务";
  openModal("result");
  announce(
    result.passed
      ? `任务通过，得分 ${result.score}。${mission.theory}`
      : `任务未通过。${buildFailureDescription(result)}`
  );
}

function retryMission() {
  closeModal();
  loadMission(state.missionIndex, false);
  showToast("已恢复本关初始参数");
  playClick();
}

function goNextMission() {
  closeModal();
  if (state.missionIndex === MISSIONS.length - 1) {
    startSettlement();
    return;
  }
  loadMission(state.missionIndex + 1, true);
  playClick();
}

function cleanExchanger() {
  if (state.cleanUses <= 0 || state.params.fouling < 0.045) return;
  state.cleanUses -= 1;
  state.params.fouling = 0.035;
  updateAll();
  playTone({ frequency: 680, duration: 0.14, gain: 0.022, type: "triangle" });
  playTone({ frequency: 920, duration: 0.18, gain: 0.018, type: "sine", delay: 0.08 });
  showToast("在线清洗完成：污垢热阻降至 3.5%");
  announce("在线清洗完成，污垢热阻降至百分之三点五");
}

function startGame() {
  state.screen = "game";
  state.runRecords = [];
  dom.startScreen.hidden = true;
  dom.gameScreen.hidden = false;
  dom.settlementScreen.hidden = true;
  closeModal();
  ensureAudio();
  playTone({ frequency: 330, duration: 0.18, gain: 0.03 });
  playTone({ frequency: 495, duration: 0.3, gain: 0.022, delay: 0.12 });
  loadMission(0, true);
}

function calculateFinalResults() {
  const validRecords = state.runRecords.filter(Boolean);
  const averageScore =
    validRecords.reduce((sum, item) => sum + item.score, 0) / validRecords.length;
  const temperature = Math.round(
    validRecords.reduce((sum, item) => sum + item.score * 0.92, 0) / validRecords.length
  );
  const energy = Math.round(
    validRecords.reduce(
      (sum, item) => sum + clamp(100 - Math.max(0, item.pump - 10) * 5, 62, 100),
      0
    ) / validRecords.length
  );
  const principle = Math.round(clamp(72 + averageScore * 0.25, 72, 100));
  const total = Math.round(temperature * 0.42 + energy * 0.26 + principle * 0.32);
  const grade = total >= 92 ? "S" : total >= 84 ? "A" : total >= 72 ? "B" : "C";
  const comments = {
    S: "优秀调度：热流、泵耗与设备状态始终在掌控之中。",
    A: "稳定可靠：关键指标达标，仍有小幅节能空间。",
    B: "任务完成：理解基本关系，但部分决策需要再优化。",
    C: "系统告警：建议复习换热器流动方式与污垢热阻。"
  };

  return {
    total,
    grade,
    comment: comments[grade],
    temperature,
    energy,
    principle
  };
}

function animateNumber(element, target, duration = 1000) {
  const start = performance.now();
  function tick(now) {
    const progress = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function startSettlement() {
  state.screen = "settlement";
  dom.gameScreen.hidden = true;
  dom.settlementScreen.hidden = false;
  dom.settlementScreen.classList.remove("is-skipped");
  closeModal();
  playSettlement();

  const final = calculateFinalResults();
  dom.gradeLetter.textContent = final.grade;
  dom.finalScore.textContent = "0";
  dom.tempScore.textContent = "0";
  dom.energyScore.textContent = "0";
  dom.principleScore.textContent = "0";
  dom.tempMetricBar.style.width = "0";
  dom.energyMetricBar.style.width = "0";
  dom.principleMetricBar.style.width = "0";
  dom.gradeComment.textContent = final.comment;
  dom.bestDecision.textContent =
    state.runRecords[state.runRecords.length - 1]?.score >= 88
      ? "在最后的高负荷任务中保持了温度与泵耗平衡。"
      : MISSIONS[state.missionIndex].bestDecision;
  dom.improvementText.textContent = MISSIONS[state.missionIndex].improvement;
  dom.reportSerial.textContent = `RPT-KB04-${String(Date.now()).slice(-6)}`;
  dom.settlementSubtitle.textContent = "热流数据汇聚完成，正在生成值班报告";
  settlementStart = performance.now();
  createSettlementParticles();

  window.clearTimeout(state.settlementTimer);
  state.settlementTimer = window.setTimeout(() => {
    animateNumber(dom.finalScore, final.total, 900);
    animateNumber(dom.tempScore, final.temperature, 850);
    animateNumber(dom.energyScore, final.energy, 850);
    animateNumber(dom.principleScore, final.principle, 850);
    dom.tempMetricBar.style.width = `${final.temperature}%`;
    dom.energyMetricBar.style.width = `${final.energy}%`;
    dom.principleMetricBar.style.width = `${final.principle}%`;
    dom.settlementSubtitle.textContent = "运行记录已归档，可查看完整任务数据";
    buildReportTable();
    announce(
      `完成全部任务。综合评级 ${final.grade}，运行评分 ${final.total} 分。`
    );
  }, 1750);
}

function skipSettlement() {
  window.clearTimeout(state.settlementTimer);
  dom.settlementScreen.classList.add("is-skipped");
  const final = calculateFinalResults();
  dom.finalScore.textContent = final.total;
  dom.tempScore.textContent = final.temperature;
  dom.energyScore.textContent = final.energy;
  dom.principleScore.textContent = final.principle;
  dom.tempMetricBar.style.width = `${final.temperature}%`;
  dom.energyMetricBar.style.width = `${final.energy}%`;
  dom.principleMetricBar.style.width = `${final.principle}%`;
  dom.settlementSubtitle.textContent = "运行记录已归档，可查看完整任务数据";
  buildReportTable();
  playClick();
}

function buildReportTable() {
  const records = state.runRecords.filter(Boolean);
  const rows = records
    .map(
      (record) => `
        <div class="report-row">
          <span class="report-index">${String(record.id).padStart(2, "0")}</span>
          <span>${record.label}</span>
          <span>${formatNumber(record.coldOut, 1)}°C</span>
          <span>${formatNumber(record.pump, 1)} kW</span>
          <span>${record.score} 分</span>
        </div>
      `
    )
    .join("");

  dom.reportTable.innerHTML = `
    <div class="report-row">
      <span>NO.</span>
      <span>任务</span>
      <span>出口温度</span>
      <span>泵耗</span>
      <span>评分</span>
    </div>
    ${rows}
  `;
}

function openFormula() {
  openModal("formula");
  playClick();
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  dom.soundBtn.classList.toggle("is-muted", !state.soundEnabled);
  dom.soundBtn.setAttribute("aria-label", state.soundEnabled ? "关闭声音" : "开启声音");
  if (state.soundEnabled) playClick();
  showToast(state.soundEnabled ? "声音已开启" : "声音已关闭");
}

function replayGame() {
  closeModal();
  dom.settlementScreen.hidden = true;
  dom.gameScreen.hidden = false;
  state.runRecords = [];
  state.settlementTimer = null;
  loadMission(0, true);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function changeParam(key, value) {
  if (!state.params || state.submitting) return;
  state.params[key] = value;
  updateAll();
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function resizeCanvas() {
  const rect = dom.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  dom.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  dom.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  canvasSize = {
    width: rect.width,
    height: rect.height,
    dpr
  };
}

function drawExchanger(now) {
  if (state.screen === "start") return;
  const ctx = dom.canvas.getContext("2d");
  if (!ctx || !state.params) return;

  const dpr = canvasSize.dpr;
  const width = canvasSize.width;
  const height = canvasSize.height;
  const logicalWidth = 1000;
  const logicalHeight = 520;
  const scale = Math.min(width / logicalWidth, height / logicalHeight);
  const offsetX = (width - logicalWidth * scale) / 2;
  const offsetY = (height - logicalHeight * scale) / 2;
  const time = now / 1000;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  const shell = { x: 110, y: 118, w: 780, h: 284 };
  const metrics = state.metrics || calculateMetrics(state.params);
  const tempNormalized = clamp((metrics.coldOut - 25) / 65, 0, 1);

  const background = ctx.createRadialGradient(500, 260, 20, 500, 260, 560);
  background.addColorStop(0, "rgba(24, 79, 98, 0.12)");
  background.addColorStop(1, "rgba(3, 13, 19, 0)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  drawTechnicalGrid(ctx, time);
  drawHeatWisps(ctx, time);
  drawPipes(ctx, shell, metrics, time);
  drawShell(ctx, shell, metrics);
  drawTubeBundle(ctx, shell, metrics, time);
  drawFlowParticles(ctx, shell, metrics, time);
  drawFouling(ctx, shell, time);
  drawSensors(ctx, shell, metrics);
  drawCanvasLabels(ctx, shell, metrics, tempNormalized);

  ctx.restore();
}

function drawTechnicalGrid(ctx, time) {
  ctx.save();
  ctx.strokeStyle = "rgba(91, 157, 181, 0.045)";
  ctx.lineWidth = 1;
  for (let x = 30; x < 1000; x += 62) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 520);
    ctx.stroke();
  }
  for (let y = 20; y < 520; y += 52) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1000, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(70, 217, 255, 0.055)";
  ctx.setLineDash([3, 10]);
  ctx.lineDashOffset = -time * 8;
  ctx.beginPath();
  ctx.moveTo(30, 456);
  ctx.lineTo(970, 456);
  ctx.stroke();
  ctx.restore();
}

function drawHeatWisps(ctx, time) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  heatWisps.forEach((wisp) => {
    const x = 130 + wisp.x * 720 + Math.sin(time * wisp.speed + wisp.phase) * 18;
    const y = 130 + wisp.y * 255;
    const gradient = ctx.createRadialGradient(x, y, 1, x, y, wisp.size);
    gradient.addColorStop(0, "rgba(255, 128, 71, 0.055)");
    gradient.addColorStop(1, "rgba(255, 128, 71, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - wisp.size, y - wisp.size, wisp.size * 2, wisp.size * 2);
  });
  ctx.restore();
}

function drawPipes(ctx, shell, metrics, time) {
  const counter = state.params.counterflow;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 22;

  // 热流体从逆流侧进入；并流时两侧同端进入。
  ctx.strokeStyle = "rgba(255, 117, 70, 0.17)";
  ctx.beginPath();
  ctx.moveTo(counter ? 978 : 20, 170);
  ctx.lineTo(counter ? shell.x + shell.w : shell.x, 170);
  ctx.stroke();

  ctx.strokeStyle = "rgba(70, 217, 255, 0.17)";
  ctx.beginPath();
  ctx.moveTo(25, 350);
  ctx.lineTo(shell.x + 72, 350);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 117, 70, 0.17)";
  ctx.beginPath();
  ctx.moveTo(counter ? shell.x : shell.x + shell.w, 350);
  ctx.lineTo(counter ? 20 : 978, 350);
  ctx.stroke();

  ctx.strokeStyle = "rgba(70, 217, 255, 0.17)";
  ctx.beginPath();
  ctx.moveTo(shell.x + shell.w, counter ? 170 : 350);
  ctx.lineTo(978, counter ? 170 : 350);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = counter ? time * 23 : -time * 23;
  ctx.strokeStyle = "rgba(255, 134, 89, 0.64)";
  ctx.beginPath();
  ctx.moveTo(counter ? 975 : 25, 170);
  ctx.lineTo(counter ? shell.x + shell.w - 5 : shell.x + 5, 170);
  ctx.stroke();

  ctx.strokeStyle = "rgba(82, 221, 255, 0.65)";
  ctx.beginPath();
  ctx.moveTo(27, 350);
  ctx.lineTo(shell.x + 70, 350);
  ctx.stroke();
  ctx.restore();
}

function drawShell(ctx, shell, metrics) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 18;
  drawRoundedRect(ctx, shell.x, shell.y, shell.w, shell.h, 38);
  const metal = ctx.createLinearGradient(0, shell.y, 0, shell.y + shell.h);
  metal.addColorStop(0, "#16313f");
  metal.addColorStop(0.42, "#0a202b");
  metal.addColorStop(1, "#07151d");
  ctx.fillStyle = metal;
  ctx.fill();
  ctx.shadowColor = "transparent";

  const heatField = ctx.createLinearGradient(shell.x, 0, shell.x + shell.w, 0);
  if (state.params.counterflow) {
    heatField.addColorStop(0, "rgba(255, 113, 60, 0.16)");
    heatField.addColorStop(0.43, "rgba(255, 151, 64, 0.08)");
    heatField.addColorStop(0.63, "rgba(70, 217, 255, 0.07)");
    heatField.addColorStop(1, "rgba(70, 217, 255, 0.14)");
  } else {
    heatField.addColorStop(0, "rgba(255, 137, 71, 0.13)");
    heatField.addColorStop(0.48, "rgba(255, 173, 83, 0.08)");
    heatField.addColorStop(1, "rgba(70, 217, 255, 0.09)");
  }
  drawRoundedRect(ctx, shell.x, shell.y, shell.w, shell.h, 38);
  ctx.fillStyle = heatField;
  ctx.fill();

  drawRoundedRect(ctx, shell.x, shell.y, shell.w, shell.h, 38);
  ctx.strokeStyle = "rgba(119, 174, 196, 0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();

  drawRoundedRect(ctx, shell.x + 8, shell.y + 8, shell.w - 16, shell.h - 16, 31);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "rgba(151, 189, 205, 0.55)";
  ctx.font = "10px 'Cascadia Mono', Consolas, monospace";
  ctx.fillText("SHELL & TUBE HEAT EXCHANGER", shell.x + 27, shell.y + 30);
  ctx.fillText(
    state.params.counterflow ? "COUNTERFLOW · 逆流" : "PARALLEL FLOW · 并流",
    shell.x + shell.w - 177,
    shell.y + 30
  );
  ctx.restore();
}

function getTubeY(index) {
  return [177, 223, 269, 315, 361][index];
}

function drawTubeBundle(ctx, shell, metrics, time) {
  const counter = state.params.counterflow;
  const tubeStart = shell.x + 54;
  const tubeEnd = shell.x + shell.w - 54;
  const tubeColor = state.params.enhancement
    ? "rgba(255, 216, 105, 0.42)"
    : "rgba(79, 217, 250, 0.46)";

  ctx.save();
  for (let i = 0; i < 5; i += 1) {
    const y = getTubeY(i);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.48)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(tubeStart, y);
    ctx.lineTo(tubeEnd, y);
    ctx.stroke();
    ctx.strokeStyle = tubeColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tubeStart, y);
    ctx.lineTo(tubeEnd, y);
    ctx.stroke();

    if (state.params.enhancement) {
      ctx.strokeStyle = "rgba(255, 208, 90, 0.34)";
      ctx.lineWidth = 1;
      for (let x = tubeStart + 12; x < tubeEnd - 8; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 5, y + 5);
        ctx.stroke();
      }
    }
  }

  const baffleXs = [220, 330, 440, 550, 660, 770];
  baffleXs.forEach((x, index) => {
    ctx.strokeStyle = "rgba(111, 158, 177, 0.36)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (index % 2 === 0) {
      ctx.moveTo(x, shell.y + 42);
      ctx.quadraticCurveTo(x, shell.y + 68, x + 24, shell.y + 68);
      ctx.lineTo(x + 24, shell.y + shell.h - 42);
    } else {
      ctx.moveTo(x, shell.y + shell.h - 42);
      ctx.quadraticCurveTo(x, shell.y + shell.h - 68, x + 24, shell.y + shell.h - 68);
      ctx.lineTo(x + 24, shell.y + 42);
    }
    ctx.stroke();
  });

  const direction = counter ? -1 : 1;
  const phase = ((time * 17) % 24) * direction;
  for (let x = tubeStart + 20; x < tubeEnd - 10; x += 42) {
    const offsetX = x + phase;
    const drawX = direction > 0 ? clamp(offsetX, tubeStart, tubeEnd) : clamp(offsetX, tubeStart, tubeEnd);
    ctx.fillStyle = "rgba(197, 247, 255, 0.55)";
    ctx.beginPath();
    ctx.moveTo(drawX + direction * 6, 269);
    ctx.lineTo(drawX - direction * 3, 265);
    ctx.lineTo(drawX - direction * 3, 273);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawFlowParticles(ctx, shell, metrics, time) {
  if (!state.params) return;
  const flowSpeed = 0.3 + state.params.coldFlow * 0.58;
  const hotSpeed = 0.25 + state.params.hotFlow * 0.48;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  particles.forEach((particle, index) => {
    if (particle.type === "cold") {
      particle.progress += (0.0007 + particle.speed * 0.004) * flowSpeed;
    } else if (particle.type === "hot") {
      particle.progress += (0.0006 + particle.speed * 0.0038) * hotSpeed;
    } else {
      particle.progress += 0.0009;
    }

    if (particle.progress > 1.02) {
      particle.progress = -0.02;
      particle.lane = Math.floor(Math.random() * 7);
    }

    let x;
    let y;
    let color;

    if (particle.type === "cold") {
      const direction = 1;
      const lane = particle.lane % 5;
      x = lerp(shell.x + 50, shell.x + shell.w - 50, particle.progress);
      y = getTubeY(lane) + Math.sin(time * 3 + particle.wobble) * 2;
      color = "70, 217, 255";
    } else if (particle.type === "hot") {
      const direction = state.params.counterflow ? -1 : 1;
      const normalized =
        direction === 1 ? particle.progress : 1 - particle.progress;
      x = lerp(shell.x + 42, shell.x + shell.w - 42, normalized);
      y =
        shell.y +
        55 +
        ((particle.lane * 31 + Math.sin(time * 1.8 + particle.wobble) * 16) %
          (shell.h - 110));
      color = "255, 117, 70";
    } else {
      x = lerp(shell.x + 78, shell.x + shell.w - 80, particle.progress);
      y = 248 + Math.sin(particle.progress * 16 + time * 2 + particle.wobble) * 76;
      color = "255, 208, 90";
    }

    const glow = ctx.createRadialGradient(x, y, 0, x, y, particle.size * 5);
    glow.addColorStop(0, `rgba(${color}, 0.8)`);
    glow.addColorStop(0.2, `rgba(${color}, 0.28)`);
    glow.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, particle.size * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${color}, 0.86)`;
    ctx.beginPath();
    ctx.arc(x, y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawFouling(ctx, shell, time) {
  if (!state.params || state.params.fouling < 0.045) return;
  ctx.save();
  ctx.strokeStyle = `rgba(191, 122, 53, ${0.15 + state.params.fouling * 0.58})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = time * 4;

  for (let i = 0; i < 5; i += 1) {
    const y = getTubeY(i);
    ctx.beginPath();
    ctx.moveTo(shell.x + 55, y - 4);
    ctx.lineTo(shell.x + shell.w - 55, y - 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSensors(ctx, shell, metrics) {
  const sensors = [
    { x: shell.x + 16, y: 170, label: "T1", value: PHYSICS.hotInlet },
    { x: shell.x + 16, y: 350, label: "T2", value: PHYSICS.coldInlet },
    { x: shell.x + shell.w - 16, y: 170, label: "T3", value: metrics.hotOut },
    { x: shell.x + shell.w - 16, y: 350, label: "T4", value: metrics.coldOut }
  ];

  ctx.save();
  sensors.forEach((sensor, index) => {
    const isHot = index < 3 && index !== 1;
    ctx.fillStyle = isHot ? "#ff9a72" : "#71e1ff";
    ctx.beginPath();
    ctx.arc(sensor.x, sensor.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isHot ? "rgba(255, 117, 70, .4)" : "rgba(70, 217, 255, .4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sensor.x, sensor.y, 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(175, 205, 217, 0.65)";
    ctx.font = "9px 'Cascadia Mono', Consolas, monospace";
    ctx.fillText(
      `${sensor.label} ${formatNumber(sensor.value, 1)}°`,
      sensor.x - 27,
      sensor.y - 15
    );
  });
  ctx.restore();
}

function drawCanvasLabels(ctx, shell, metrics, tempNormalized) {
  const counter = state.params.counterflow;
  ctx.save();
  ctx.font = "11px 'Microsoft YaHei UI', 'PingFang SC', sans-serif";

  const hotInX = counter ? 858 : 22;
  const hotInY = counter ? 87 : 95;
  const hotOutX = counter ? 22 : 862;
  const hotOutY = counter ? 421 : 95;
  const coldOutX = 858;
  const coldOutY = counter ? 195 : 403;

  ctx.fillStyle = "rgba(255, 158, 120, 0.74)";
  ctx.fillText("热流体入口", hotInX, hotInY);
  ctx.fillText("125°C", hotInX, hotInY + 19);

  ctx.fillStyle = "rgba(112, 225, 255, 0.74)";
  ctx.fillText("冷流体入口", 28, 359);
  ctx.fillText("25°C", 28, 378);

  ctx.fillStyle = "rgba(255, 158, 120, 0.74)";
  ctx.fillText("热流体出口", hotOutX, hotOutY);
  ctx.fillText(`${formatNumber(metrics.hotOut, 1)}°C`, hotOutX, hotOutY + 19);

  ctx.fillStyle = "rgba(112, 225, 255, 0.82)";
  ctx.fillText("冷流体出口", coldOutX, coldOutY);
  ctx.fillText(
    `${formatNumber(metrics.coldOut, 1)}°C`,
    coldOutX,
    coldOutY + 19
  );

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(149, 185, 200, 0.55)";
  ctx.font = "9px 'Cascadia Mono', Consolas, monospace";
  ctx.fillText(
    `Q ${formatNumber(metrics.Q, 1)} kW  ·  K ${formatNumber(metrics.K, 2)} kW/K  ·  P ${formatNumber(metrics.pump, 1)} kW`,
    shell.x + shell.w / 2,
    448
  );

  ctx.fillStyle = `rgba(70, 217, 255, ${0.12 + tempNormalized * 0.2})`;
  ctx.fillRect(shell.x + shell.w / 2 - 140, 460, 280 * tempNormalized, 2);
  ctx.restore();
}

function drawGameLoop(now) {
  state.globalTime = now / 1000;
  if (!dom.gameScreen.hidden && state.params) {
    drawExchanger(now);
    renderLiveCanvasOnly();
  }
  if (!dom.settlementScreen.hidden) {
    drawSettlement(now);
  }
  requestAnimationFrame(drawGameLoop);
}

let lastMetricPaint = 0;
function renderLiveCanvasOnly() {
  if (performance.now() - lastMetricPaint < 80) return;
  lastMetricPaint = performance.now();
  const metrics = calculateMetrics(state.params);
  state.metrics = metrics;
  dom.coldOutValue.textContent = formatNumber(metrics.coldOut, 1);
  dom.heatValue.textContent = formatNumber(metrics.Q, 1);
  dom.pumpValue.textContent = formatNumber(metrics.pump, 1);
  dom.kValue.textContent = formatNumber(metrics.K, 2);
}

function createSettlementParticles() {
  settlementParticles = Array.from({ length: 170 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 160 + Math.random() * Math.min(window.innerWidth, window.innerHeight) * 0.52;
    return {
      angle,
      radius,
      speed: 0.08 + Math.random() * 0.22,
      size: 0.7 + Math.random() * 2.4,
      color: Math.random() > 0.62 ? "255, 138, 85" : "82, 221, 255",
      alpha: 0.18 + Math.random() * 0.58
    };
  });
}

function drawSettlement(now) {
  const canvas = dom.settlementCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(rect.width * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  const ctx = canvas.getContext("2d");
  const width = rect.width;
  const height = rect.height;
  const time = (now - settlementStart) / 1000;
  const centerX = width / 2;
  const centerY = height * 0.39;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  settlementParticles.forEach((particle, index) => {
    const convergence = clamp(0.55 + Math.sin(time * 0.9 + index) * 0.18, 0.2, 1);
    const angle = particle.angle + time * particle.speed * (index % 2 === 0 ? 1 : -1);
    const pulse = 1 - (time * 0.08) % 0.45;
    const radius = particle.radius * convergence * pulse;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius * 0.62;
    const alpha = particle.alpha * clamp(1 - Math.max(0, time - 4) * 0.2, 0, 1);

    ctx.fillStyle = `rgba(${particle.color}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, particle.size, 0, Math.PI * 2);
    ctx.fill();

    if (index % 9 === 0) {
      ctx.strokeStyle = `rgba(${particle.color}, ${alpha * 0.16})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(centerX, centerY);
      ctx.stroke();
    }
  });

  const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 240);
  glow.addColorStop(0, "rgba(70, 217, 255, 0.12)");
  glow.addColorStop(0.24, "rgba(70, 217, 255, 0.045)");
  glow.addColorStop(1, "rgba(70, 217, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function bindEvents() {
  dom.startBtn.addEventListener("click", startGame);
  dom.startHelpBtn.addEventListener("click", openFormula);
  dom.formulaBtn.addEventListener("click", openFormula);
  dom.soundBtn.addEventListener("click", toggleSound);
  dom.pauseBtn.addEventListener("click", () => {
    if (!dom.gameScreen.hidden) {
      openModal("pause");
      playClick();
    }
  });

  dom.hotFlow.addEventListener("input", (event) => {
    changeParam("hotFlow", Number(event.target.value));
    playClick();
  });
  dom.coldFlow.addEventListener("input", (event) => {
    changeParam("coldFlow", Number(event.target.value));
  });
  dom.areaFactor.addEventListener("input", (event) => {
    changeParam("area", Number(event.target.value));
  });

  dom.parallelBtn.addEventListener("click", () => {
    if (state.submitting) return;
    state.params.counterflow = false;
    updateAll();
    playTone({ frequency: 390, duration: 0.08, gain: 0.018 });
  });
  dom.counterBtn.addEventListener("click", () => {
    if (state.submitting) return;
    state.params.counterflow = true;
    updateAll();
    playTone({ frequency: 550, duration: 0.08, gain: 0.018 });
  });
  dom.turbulatorBtn.addEventListener("click", () => {
    if (state.submitting || dom.turbulatorBtn.disabled) return;
    state.params.enhancement = !state.params.enhancement;
    updateAll();
    playTone({ frequency: state.params.enhancement ? 670 : 430, duration: 0.11, gain: 0.02 });
    showToast(state.params.enhancement ? "强化传热已投用：K 上升，泵耗增加" : "强化传热已停用");
  });
  dom.cleanBtn.addEventListener("click", cleanExchanger);
  dom.submitBtn.addEventListener("click", submitMission);
  dom.restartMissionBtn.addEventListener("click", () => {
    if (state.submitting) return;
    loadMission(state.missionIndex, false);
    showToast("本关参数已重置");
  });

  dom.briefingStartBtn.addEventListener("click", () => {
    closeModal();
    playClick();
  });
  dom.briefingCloseBtn.addEventListener("click", () => {
    closeModal();
    playClick();
  });
  dom.retryBtn.addEventListener("click", retryMission);
  dom.nextBtn.addEventListener("click", goNextMission);
  dom.continueBtn.addEventListener("click", closeModal);
  dom.pauseRestartBtn.addEventListener("click", () => {
    closeModal();
    startGame();
  });
  dom.replayBtn.addEventListener("click", replayGame);
  dom.reportReplayBtn.addEventListener("click", replayGame);
  dom.viewReportBtn.addEventListener("click", () => {
    buildReportTable();
    openModal("report");
    playClick();
  });
  dom.skipSettlementBtn.addEventListener("click", skipSettlement);

  $$(".formula-close, .report-close").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal();
      playClick();
    });
  });

  dom.modalBackdrop.addEventListener("click", (event) => {
    if (event.target !== dom.modalBackdrop) return;
    if (state.modal === "result") return;
    closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.modal) {
      if (state.modal !== "result") closeModal();
    }
    if (
      event.key === "Enter" &&
      !state.submitting &&
      !dom.gameScreen.hidden &&
      !state.modal
    ) {
      submitMission();
    }
  });

  window.addEventListener("resize", resizeCanvas);
}

function init() {
  bindEvents();
  resizeCanvas();
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(dom.canvas);
  }
  requestAnimationFrame(drawGameLoop);
}

init();
