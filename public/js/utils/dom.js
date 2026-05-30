export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function collectDomRefs() {
  return {
    form: qs("#chatForm"),
    input: qs("#playerInput"),
    sendButton: qs("#sendButton"),
    quickActions: qs("#quickActions"),
    sessionSaveStatus: qs("#sessionSaveStatus"),
    exportLogButton: qs("#exportLogButton"),
    exportJsonButton: qs("#exportJsonButton"),
    importJsonButton: qs("#importJsonButton"),
    resetSessionButton: qs("#resetSessionButton"),
    importSaveInput: qs("#importSaveInput"),
    messages: qs("#messages"),
    errorBox: qs("#errorBox"),
    resetConversation: qs("#resetConversation"),
    debugModeToggle: qs("#debugModeToggle"),
    conversationBadge: qs("#conversationBadge"),
    topStateHp: qs("#topStateHp"),
    topStateMp: qs("#topStateMp"),
    topStateObjective: qs("#topStateObjective"),
    stateHp: qs("#stateHp"),
    stateMp: qs("#stateMp"),
    stateFingers: qs("#stateFingers"),
    stateGojo: qs("#stateGojo"),
    stateNanami: qs("#stateNanami"),
    stateObjective: qs("#stateObjective"),
    stateAttributes: qs("#stateAttributes"),
    stateInventory: qs("#stateInventory"),
    stateFlags: qs("#stateFlags"),
    diceLast: qs("#diceLast"),
    diceAttribute: qs("#diceAttribute"),
    diceAttributeValue: qs("#diceAttributeValue"),
    diceDifficulty: qs("#diceDifficulty"),
    diceTarget: qs("#diceTarget"),
    diceRoll: qs("#diceRoll"),
    diceSuccess: qs("#diceSuccess"),
    diceCritical: qs("#diceCritical"),
    sessionSummary: qs("#sessionSummary"),
    changeLog: qs("#changeLog"),
    parserWarnings: qs("#parserWarnings"),
    parserSourceMap: qs("#parserSourceMap")
  };
}
