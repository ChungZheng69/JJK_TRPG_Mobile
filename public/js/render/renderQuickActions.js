export const QUICK_ACTIONS = [
  { category: "System", label: "状态", text: "状态" },
  { category: "System", label: "背囊", text: "背囊" },
  { category: "Exploration", label: "观察周围", text: "我观察周围环境，确认有没有异常残秽、敌人气息或可调查线索。" },
  { category: "Exploration", label: "谨慎前进", text: "我放慢脚步，保持警戒，谨慎向前推进。" },
  { category: "Stealth", label: "隐藏咒力", text: "我压低呼吸，尝试隐藏自己的咒力波动，避免被敌人察觉。" },
  { category: "Combat", label: "发动鸣雷", text: "我发动「鸣雷」，以肉体活化强化速度，准备进行高速行动。" },
  { category: "Social", label: "询问NPC", text: "我观察附近NPC的反应，并尝试开口询问当前情况。" },
  { category: "System", label: "SESSION SAVE", text: "(OOC: SESSION SAVE)" }
];

let quickActionsBound = false;

export function renderQuickActions({ container, input, actions = QUICK_ACTIONS }) {
  if (!container || !input) return;

  container.innerHTML = actions
    .map((action, index) => `
      <button
        class="quick-action-button"
        type="button"
        data-quick-action-index="${index}"
        title="${escapeAttribute(action.text)}"
      >
        <span class="quick-action-category">${escapeHtml(action.category)}</span>
        <span class="quick-action-label">${escapeHtml(action.label)}</span>
      </button>
    `)
    .join("");

  if (quickActionsBound) return;
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-action-index]");
    if (!button || !container.contains(button)) return;
    const action = actions[Number(button.dataset.quickActionIndex)];
    if (!action) return;
    insertQuickAction(input, action.text);
  });
  quickActionsBound = true;
}

export function insertQuickAction(input, text) {
  const current = input.value.trimEnd();
  input.value = current ? `${current}\n${text}` : text;
  input.focus();
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}
