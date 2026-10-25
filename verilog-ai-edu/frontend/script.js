/**
 * VerilogLab — Professional Browser EDA IDE
 * Milestone 2 Architecture & State Manager
 */

(function () {
  "use strict";

  // ==========================================
  // 1. Initial State & Default Projects
  // ==========================================

  const DEFAULT_PROJECTS = [
    {
      id: "proj_half_adder",
      name: "Half Adder",
      language: "verilog",
      moduleName: "half_adder",
      rtl: `module half_adder (
  input wire a,
  input wire b,
  output wire sum,
  output wire carry
);

assign sum = a ^ b;
assign carry = a & b;

endmodule
`,
      testbench: `module half_adder_tb;

reg a;
reg b;
wire sum;
wire carry;

half_adder uut (
  .a(a),
  .b(b),
  .sum(sum),
  .carry(carry)
);

initial begin
  $dumpfile("waveform.vcd");
  $dumpvars(0, half_adder_tb);
end

initial begin
  a = 0; b = 0; #10;
  $display("a=%b, b=%b -> sum=%b, carry=%b", a, b, sum, carry);
  if (sum !== 0 || carry !== 0) $display("ASSERTION FAILED: expected 0,0 got %b,%b", sum, carry);

  a = 0; b = 1; #10;
  $display("a=%b, b=%b -> sum=%b, carry=%b", a, b, sum, carry);
  if (sum !== 1 || carry !== 0) $display("ASSERTION FAILED: expected 1,0 got %b,%b", sum, carry);

  a = 1; b = 0; #10;
  $display("a=%b, b=%b -> sum=%b, carry=%b", a, b, sum, carry);
  if (sum !== 1 || carry !== 0) $display("ASSERTION FAILED: expected 1,0 got %b,%b", sum, carry);

  a = 1; b = 1; #10;
  $display("a=%b, b=%b -> sum=%b, carry=%b", a, b, sum, carry);
  if (sum !== 0 || carry !== 1) $display("ASSERTION FAILED: expected 0,1 got %b,%b", sum, carry);

  $display("All half adder tests passed.");
  $finish;
end

endmodule
`,
      updatedAt: Date.now()
    },
    {
      id: "proj_dff",
      name: "D Flip-Flop",
      language: "verilog",
      moduleName: "dff",
      rtl: `module dff (
  input wire clk,
  input wire reset,
  input wire d,
  output reg q
);

always @(posedge clk or posedge reset) begin
  if (reset)
    q <= 1'b0;
  else
    q <= d;
end

endmodule
`,
      testbench: `module tb;

reg clk;
reg reset;
reg d;
wire q;

dff uut (
  .clk(clk),
  .reset(reset),
  .d(d),
  .q(q)
);

initial begin
  $dumpfile("waveform.vcd");
  $dumpvars(0, tb);
end

initial begin
  clk = 0;
  forever #5 clk = ~clk;
end

initial begin
  reset = 1;
  d = 0;
  #10 reset = 0;
  #5 d = 1;
  #10 d = 0;
  #10 d = 1;
  #10 d = 0;
  #20 $finish;
end

endmodule
`,
      updatedAt: Date.now()
    },
    {
      id: "proj_counter",
      name: "4-Bit Counter",
      language: "verilog",
      moduleName: "counter",
      rtl: `module counter (
  input wire clk,
  input wire rst,
  output reg [3:0] count
);

always @(posedge clk or posedge rst) begin
  if (rst)
    count <= 4'b0000;
  else
    count <= count + 1'b1;
end

endmodule
`,
      testbench: `module counter_tb;

reg clk;
reg rst;
wire [3:0] count;

counter uut (
  .clk(clk),
  .rst(rst),
  .count(count)
);

initial begin
  $dumpfile("waveform.vcd");
  $dumpvars(0, counter_tb);
end

initial begin
  clk = 0;
  forever #5 clk = ~clk;
end

initial begin
  rst = 1;
  #12 rst = 0;
  #100;
  if (count > 0) $display("Counter test passed: count=%0d", count);
  else $display("Counter test failed");
  $finish;
end

endmodule
`,
      updatedAt: Date.now()
    }
  ];

  // Storage Keys
  const STORAGE_PROJECTS = "veriloglab_projects_v2";
  const STORAGE_ACTIVE_ID = "veriloglab_active_project_id_v2";
  const STORAGE_THEME = "veriloglab_theme";
  const STORAGE_PANELS = "veriloglab_panels_state_v2";
  const STORAGE_SESSIONS = "veriloglab_sessions_v2";

  // State
  let projects = [];
  let activeProjectId = null;
  let hasUnsavedChanges = false;
  let activeViewMode = "split"; // 'rtl' | 'testbench' | 'split'
  let activeDockTab = "diagnostics";
  let activeWaveformViewer = "surfer"; // 'surfer' | 'canvas'
  let lastSimulationResult = null;
  let lastVcdText = null;
  let pendingNewProjectData = null;
  let pendingDeleteProjectId = null;

  // ==========================================
  // 2. DOM Elements
  // ==========================================

  // Topbar
  const btnToggleLeftSidebar = document.getElementById("btn-toggle-left-sidebar");
  const currentProjectLabel = document.getElementById("current-project-label");
  const unsavedIndicator = document.getElementById("unsaved-indicator");
  const languageSelect = document.getElementById("language-select");
  const btnViewRtl = document.getElementById("btn-view-rtl");
  const btnViewTestbench = document.getElementById("btn-view-testbench");
  const btnViewSplit = document.getElementById("btn-view-split");
  const btnCheckRtl = document.getElementById("btn-check-rtl");
  const btnRunSim = document.getElementById("btn-run-sim");
  const btnToggleOutput = document.getElementById("btn-toggle-output");
  const btnToggleAi = document.getElementById("btn-toggle-ai");
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const themeIconMoon = document.getElementById("theme-icon-moon");
  const themeIconSun = document.getElementById("theme-icon-sun");

  // Layout & Sidebars
  const leftSidebar = document.getElementById("left-sidebar");
  const aiSidebar = document.getElementById("ai-sidebar");
  const outputDock = document.getElementById("output-dock");
  const editorsContainer = document.getElementById("editors-container");
  const rtlPane = document.getElementById("rtl-pane");
  const testbenchPane = document.getElementById("testbench-pane");

  // Sidebar controls
  const btnNewProject = document.getElementById("btn-new-project");
  const sidebarSearch = document.getElementById("sidebar-search");
  const projectListEl = document.getElementById("project-list");
  const projectCountEl = document.getElementById("project-count");
  const historyListEl = document.getElementById("history-list");
  const templateQuickList = document.getElementById("template-quick-list");
  const btnCloseAi = document.getElementById("btn-close-ai");

  // Workspace actions
  const btnSaveProject = document.getElementById("btn-save-project");
  const btnCopyCode = document.getElementById("btn-copy-code");
  const workspaceActiveTitle = document.getElementById("workspace-active-title");
  const rtlFileBadge = document.getElementById("rtl-file-badge");
  const tbFileBadge = document.getElementById("tb-file-badge");

  // Dock Tabs & Panels
  const dockTabDiagnostics = document.getElementById("dock-tab-diagnostics");
  const dockTabTerminal = document.getElementById("dock-tab-terminal");
  const dockTabWaveform = document.getElementById("dock-tab-waveform");
  const dockTabResults = document.getElementById("dock-tab-results");
  const dockDiagBadge = document.getElementById("dock-diag-badge");
  const btnClearDock = document.getElementById("btn-clear-dock");
  const btnToggleDockSize = document.getElementById("btn-toggle-dock-size");

  const dockPanelDiagnostics = document.getElementById("dock-panel-diagnostics");
  const dockPanelTerminal = document.getElementById("dock-panel-terminal");
  const dockPanelWaveform = document.getElementById("dock-panel-waveform");
  const dockPanelResults = document.getElementById("dock-panel-results");

  const diagnosticsContainer = document.getElementById("diagnostics-container");
  const terminalOutput = document.getElementById("terminal-output");
  const resultsStatusText = document.getElementById("results-status-text");
  const resultsLogText = document.getElementById("results-log-text");
  const resultsStatusCard = document.getElementById("results-status-card");

  // Waveform elements
  const btnSwitchViewer = document.getElementById("btn-switch-viewer");
  const vcdDownloadLink = document.getElementById("vcd-download-link");
  const surferFrameWrap = document.getElementById("surfer-frame-wrap");
  const surferFrame = document.getElementById("surfer-frame");
  const waveformCanvasView = document.getElementById("waveform-canvas-view");
  const canvasControlsGroup = document.getElementById("canvas-controls-group");
  const waveformEmptyState = document.getElementById("waveform-empty-state");

  // AI Tutor elements
  const chipExplainCode = document.getElementById("chip-explain-code");
  const chipDiagnoseError = document.getElementById("chip-diagnose-error");
  const chipSuggestFix = document.getElementById("chip-suggest-fix");
  const aiChatHistory = document.getElementById("ai-chat-history");
  const aiQueryInput = document.getElementById("ai-query-input");
  const aiSendBtn = document.getElementById("ai-send-btn");

  // Status Bar
  const statusSystemState = document.getElementById("status-system-state");
  const statusProjectName = document.getElementById("status-project-name");
  const statusViewMode = document.getElementById("status-view-mode");
  const statusBackendPill = document.getElementById("status-backend-pill");
  const statusBackendText = document.getElementById("status-backend-text");
  const statusValidationText = document.getElementById("status-validation-text");
  const statusSimulationText = document.getElementById("status-simulation-text");

  // Modals
  const newProjectModal = document.getElementById("new-project-modal");
  const newProjectForm = document.getElementById("new-project-form");
  const newProjectNameInput = document.getElementById("new-project-name-input");
  const newProjectFilenameInput = document.getElementById("new-project-filename-input");
  const newProjectLangSelect = document.getElementById("new-project-lang-select");
  const newProjectError = document.getElementById("new-project-error");
  const btnCancelNewProject = document.getElementById("btn-cancel-new-project");

  const templateConfirmModal = document.getElementById("template-confirm-modal");
  const confirmModuleName = document.getElementById("confirm-module-name");
  const confirmReplaceBtn = document.getElementById("confirm-replace-btn");
  const confirmKeepBtn = document.getElementById("confirm-keep-btn");
  const confirmCancelBtn = document.getElementById("confirm-cancel-btn");

  const deleteConfirmModal = document.getElementById("delete-confirm-modal");
  const deleteProjectName = document.getElementById("delete-project-name");
  const btnCancelDelete = document.getElementById("btn-cancel-delete");
  const btnConfirmDelete = document.getElementById("btn-confirm-delete");

  // ==========================================
  // 3. Initialize CodeMirror Editors
  // ==========================================

  const rtlTextarea = document.getElementById("rtl-code");
  const testbenchTextarea = document.getElementById("testbench-code");

  const rtlEditor = CodeMirror.fromTextArea(rtlTextarea, {
    mode: "text/x-verilog",
    theme: "material-darker",
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: true,
    styleActiveLine: true,
    matchBrackets: true
  });

  const testbenchEditor = CodeMirror.fromTextArea(testbenchTextarea, {
    mode: "text/x-verilog",
    theme: "material-darker",
    lineNumbers: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: true,
    styleActiveLine: true,
    matchBrackets: true
  });

  function setUnsavedChanges(unsaved) {
    hasUnsavedChanges = unsaved;
    if (unsavedIndicator) {
      unsavedIndicator.classList.toggle("visible", unsaved);
    }
  }

  rtlEditor.on("change", () => {
    setUnsavedChanges(true);
    updateLanguageBadges();
  });

  testbenchEditor.on("change", () => {
    setUnsavedChanges(true);
    updateLanguageBadges();
  });

  function refreshEditors() {
    setTimeout(() => {
      rtlEditor.refresh();
      testbenchEditor.refresh();
    }, 20);
  }

  // ==========================================
  // 4. Persistence Management
  // ==========================================

  function loadSavedProjects() {
    try {
      const data = localStorage.getItem(STORAGE_PROJECTS);
      if (data) {
        projects = JSON.parse(data);
      }
    } catch (e) {
      console.warn("Failed to parse projects from localStorage", e);
    }

    if (!Array.isArray(projects) || projects.length === 0) {
      projects = JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
      saveProjectsToStorage();
    }
  }

  function saveProjectsToStorage() {
    try {
      localStorage.setItem(STORAGE_PROJECTS, JSON.stringify(projects));
    } catch (e) {
      console.error("Failed to save projects to localStorage", e);
    }
  }

  function getActiveProject() {
    return projects.find((p) => p.id === activeProjectId) || projects[0];
  }

  function saveCurrentProject() {
    const p = getActiveProject();
    if (!p) return;

    p.rtl = rtlEditor.getValue();
    p.testbench = testbenchEditor.getValue();
    p.language = languageSelect.value;
    p.updatedAt = Date.now();

    saveProjectsToStorage();
    setUnsavedChanges(false);
    renderProjectList();
    showStatusNotification("Project saved to workspace.");
  }

  function switchProject(id) {
    if (hasUnsavedChanges) {
      saveCurrentProject();
    }

    const target = projects.find((p) => p.id === id);
    if (!target) return;

    activeProjectId = target.id;
    try {
      localStorage.setItem(STORAGE_ACTIVE_ID, activeProjectId);
    } catch (e) {}

    // Load data
    rtlEditor.setValue(target.rtl || "");
    testbenchEditor.setValue(target.testbench || "");
    if (languageSelect) {
      languageSelect.value = target.language || "verilog";
    }

    if (currentProjectLabel) {
      currentProjectLabel.textContent = target.name;
    }
    if (statusProjectName) {
      statusProjectName.textContent = `Project: ${target.name}`;
    }

    setUnsavedChanges(false);
    updateLanguageBadges();
    renderProjectList();
    refreshEditors();
  }

  function renderProjectList(filter = "") {
    if (!projectListEl) return;
    projectListEl.innerHTML = "";

    const term = filter.trim().toLowerCase();
    const filtered = projects.filter((p) =>
      p.name.toLowerCase().includes(term) || (p.moduleName && p.moduleName.toLowerCase().includes(term))
    );

    if (projectCountEl) {
      projectCountEl.textContent = `(${projects.length})`;
    }

    filtered.forEach((p) => {
      const li = document.createElement("li");
      li.className = `sidebar-item ${p.id === activeProjectId ? "active" : ""}`;

      const content = document.createElement("div");
      content.className = "sidebar-item-content";
      content.innerHTML = `
        <span class="sidebar-item-icon">📁</span>
        <span title="${p.name}">${p.name}</span>
      `;
      content.addEventListener("click", () => switchProject(p.id));

      const tag = document.createElement("span");
      tag.className = "sidebar-item-tag";
      tag.textContent = p.language === "systemverilog" ? "SV" : "V";

      const actions = document.createElement("div");
      actions.className = "sidebar-item-actions";

      // Delete action
      const btnDel = document.createElement("button");
      btnDel.className = "sidebar-action-btn delete";
      btnDel.title = "Delete Project";
      btnDel.innerHTML = "✕";
      btnDel.addEventListener("click", (e) => {
        e.stopPropagation();
        openDeleteModal(p.id, p.name);
      });

      actions.appendChild(btnDel);

      li.appendChild(content);
      li.appendChild(tag);
      li.appendChild(actions);

      projectListEl.appendChild(li);
    });
  }

  function addSimulationSession(projectName, status, message) {
    let sessions = [];
    try {
      sessions = JSON.parse(localStorage.getItem(STORAGE_SESSIONS) || "[]");
    } catch (e) {}

    sessions.unshift({
      id: "sess_" + Date.now(),
      projectName,
      status, // 'passed' | 'failed'
      message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    if (sessions.length > 8) sessions.pop();
    try {
      localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(sessions));
    } catch (e) {}

    renderHistoryList();
  }

  function renderHistoryList() {
    if (!historyListEl) return;
    historyListEl.innerHTML = "";

    let sessions = [];
    try {
      sessions = JSON.parse(localStorage.getItem(STORAGE_SESSIONS) || "[]");
    } catch (e) {}

    if (sessions.length === 0) {
      const empty = document.createElement("li");
      empty.className = "sidebar-item";
      empty.style.opacity = "0.6";
      empty.style.fontSize = "12px";
      empty.textContent = "No recent simulations";
      historyListEl.appendChild(empty);
      return;
    }

    sessions.forEach((s) => {
      const li = document.createElement("li");
      li.className = "sidebar-item";
      const icon = s.status === "passed" ? "✓" : "✗";
      const color = s.status === "passed" ? "var(--color-success)" : "var(--color-error)";

      li.innerHTML = `
        <div class="sidebar-item-content">
          <span style="color: ${color}; font-weight: bold; font-size: 11px;">${icon}</span>
          <span style="font-size: 12px;">${s.projectName}</span>
        </div>
        <span style="font-size: 10px; color: var(--text-muted);">${s.time}</span>
      `;
      historyListEl.appendChild(li);
    });
  }

  // ==========================================
  // 5. Theme Management (Dark & Light)
  // ==========================================

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_THEME, theme);
    } catch (e) {}

    const isLight = theme === "light";
    if (themeIconMoon && themeIconSun) {
      themeIconMoon.style.display = isLight ? "none" : "block";
      themeIconSun.style.display = isLight ? "block" : "none";
    }

    // CodeMirror theme update
    const cmTheme = isLight ? "default" : "material-darker";
    rtlEditor.setOption("theme", cmTheme);
    testbenchEditor.setOption("theme", cmTheme);
    refreshEditors();
  }

  function initTheme() {
    let savedTheme = "dark";
    try {
      savedTheme = localStorage.getItem(STORAGE_THEME) || "dark";
    } catch (e) {}
    applyTheme(savedTheme);

    if (btnThemeToggle) {
      btnThemeToggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
      });
    }
  }

  // ==========================================
  // 6. View Mode Management (RTL / TB / Split)
  // ==========================================

  function setViewMode(mode) {
    activeViewMode = mode;
    try {
      localStorage.setItem("veriloglab_view_mode", mode);
    } catch (e) {}

    [btnViewRtl, btnViewTestbench, btnViewSplit].forEach((btn) => {
      if (btn) btn.classList.remove("active");
    });

    if (mode === "rtl") {
      if (btnViewRtl) btnViewRtl.classList.add("active");
      rtlPane.style.display = "flex";
      testbenchPane.style.display = "none";
      editorsContainer.classList.remove("split-mode");
      if (statusViewMode) statusViewMode.textContent = "View: RTL Only";
      if (workspaceActiveTitle) workspaceActiveTitle.textContent = "RTL Source View";
    } else if (mode === "testbench") {
      if (btnViewTestbench) btnViewTestbench.classList.add("active");
      rtlPane.style.display = "none";
      testbenchPane.style.display = "flex";
      editorsContainer.classList.remove("split-mode");
      if (statusViewMode) statusViewMode.textContent = "View: Testbench Only";
      if (workspaceActiveTitle) workspaceActiveTitle.textContent = "Testbench View";
    } else {
      // Split
      if (btnViewSplit) btnViewSplit.classList.add("active");
      rtlPane.style.display = "flex";
      testbenchPane.style.display = "flex";
      editorsContainer.classList.add("split-mode");
      if (statusViewMode) statusViewMode.textContent = "View: Split View";
      if (workspaceActiveTitle) workspaceActiveTitle.textContent = "RTL & Testbench Workspace";
    }

    refreshEditors();
  }

  function updateLanguageBadges() {
    const isSv = languageSelect && languageSelect.value === "systemverilog";
    const p = getActiveProject();
    if (rtlFileBadge) {
      rtlFileBadge.textContent = (p && p.filename) ? p.filename : (isSv ? "design.sv" : "design.v");
    }
    if (tbFileBadge) {
      const tbName = (p && p.moduleName) ? `${p.moduleName}_tb.${isSv ? "sv" : "v"}` : (isSv ? "testbench.sv" : "testbench.v");
      tbFileBadge.textContent = tbName;
    }
  }

  // ==========================================
  // 7. Panel Toggle & Persistence
  // ==========================================

  // Waveform Resize & Reflow Notification
  function notifyWaveformResize() {
    if (surferFrame && surferFrame.contentWindow) {
      try {
        surferFrame.contentWindow.dispatchEvent(new Event("resize"));
      } catch (e) {}
    }
    if (activeWaveformViewer === "canvas" && lastVcdText && window.renderVcdOnCanvas) {
      window.renderVcdOnCanvas(lastVcdText);
    }
  }

  function initPanels() {
    let panelState = { left: true, right: true, dock: true };
    try {
      const saved = localStorage.getItem(STORAGE_PANELS);
      if (saved) panelState = JSON.parse(saved);
    } catch (e) {}

    if (!panelState.left) leftSidebar.classList.add("collapsed");
    if (!panelState.right) aiSidebar.classList.add("collapsed");
    if (!panelState.dock) outputDock.classList.add("collapsed");

    // Restore preferred dock height
    try {
      const savedHeight = localStorage.getItem("veriloglab_dock_height");
      if (savedHeight && !isNaN(parseInt(savedHeight, 10))) {
        const h = Math.min(Math.max(parseInt(savedHeight, 10), 120), window.innerHeight * 0.85);
        outputDock.style.height = `${h}px`;
      }
    } catch (e) {}

    // Draggable Dock Resizer
    const dockResizer = document.getElementById("dock-resizer");
    if (dockResizer) {
      let isResizing = false;
      let startY = 0;
      let startH = 0;

      dockResizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        startY = e.clientY;
        startH = outputDock.getBoundingClientRect().height;
        outputDock.style.transition = "none";
        dockResizer.classList.add("dragging");
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";

        if (surferFrame) surferFrame.style.pointerEvents = "none";
        e.preventDefault();
      });

      window.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const delta = startY - e.clientY;
        const minH = 120;
        const maxH = window.innerHeight * 0.85;
        const newH = Math.min(Math.max(startH + delta, minH), maxH);
        outputDock.style.height = `${newH}px`;

        if (outputDock.classList.contains("collapsed")) {
          outputDock.classList.remove("collapsed");
          savePanelState();
          updateTopbarPanelButtons();
        }

        notifyWaveformResize();
      });

      window.addEventListener("mouseup", () => {
        if (!isResizing) return;
        isResizing = false;
        outputDock.style.transition = "";
        dockResizer.classList.remove("dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        if (surferFrame) surferFrame.style.pointerEvents = "auto";

        const finalH = Math.round(outputDock.getBoundingClientRect().height);
        try {
          localStorage.setItem("veriloglab_dock_height", finalH);
        } catch (e) {}

        refreshEditors();
        notifyWaveformResize();
      });
    }

    updateTopbarPanelButtons();

    // Event listeners
    if (btnToggleLeftSidebar) {
      btnToggleLeftSidebar.addEventListener("click", () => {
        leftSidebar.classList.toggle("collapsed");
        savePanelState();
        updateTopbarPanelButtons();
        refreshEditors();
        notifyWaveformResize();
      });
    }

    if (btnToggleAi) {
      btnToggleAi.addEventListener("click", () => {
        aiSidebar.classList.toggle("collapsed");
        savePanelState();
        updateTopbarPanelButtons();
        refreshEditors();
        notifyWaveformResize();
      });
    }

    if (btnCloseAi) {
      btnCloseAi.addEventListener("click", () => {
        aiSidebar.classList.add("collapsed");
        savePanelState();
        updateTopbarPanelButtons();
        refreshEditors();
        notifyWaveformResize();
      });
    }

    if (btnToggleOutput) {
      btnToggleOutput.addEventListener("click", () => {
        outputDock.classList.toggle("collapsed");
        savePanelState();
        updateTopbarPanelButtons();
        refreshEditors();
        notifyWaveformResize();
      });
    }

    if (btnToggleDockSize) {
      btnToggleDockSize.addEventListener("click", () => {
        outputDock.classList.toggle("collapsed");
        savePanelState();
        updateTopbarPanelButtons();
        refreshEditors();
        notifyWaveformResize();
      });
    }
  }

  function savePanelState() {
    const state = {
      left: !leftSidebar.classList.contains("collapsed"),
      right: !aiSidebar.classList.contains("collapsed"),
      dock: !outputDock.classList.contains("collapsed")
    };
    try {
      localStorage.setItem(STORAGE_PANELS, JSON.stringify(state));
    } catch (e) {}
  }

  function updateTopbarPanelButtons() {
    if (btnToggleOutput) {
      btnToggleOutput.classList.toggle("active", !outputDock.classList.contains("collapsed"));
    }
    if (btnToggleAi) {
      btnToggleAi.classList.toggle("active", !aiSidebar.classList.contains("collapsed"));
    }
  }

  // ==========================================
  // 8. Output Dock Tabs
  // ==========================================

  function switchDockTab(tabName) {
    activeDockTab = tabName;

    [dockTabDiagnostics, dockTabTerminal, dockTabWaveform, dockTabResults].forEach((btn) => {
      if (btn) btn.classList.remove("active");
    });

    [dockPanelDiagnostics, dockPanelTerminal, dockPanelWaveform, dockPanelResults].forEach((p) => {
      if (p) p.classList.remove("active");
    });

    if (outputDock.classList.contains("collapsed")) {
      outputDock.classList.remove("collapsed");
      savePanelState();
      updateTopbarPanelButtons();
    }

    if (tabName === "diagnostics") {
      dockTabDiagnostics.classList.add("active");
      dockPanelDiagnostics.classList.add("active");
    } else if (tabName === "terminal") {
      dockTabTerminal.classList.add("active");
      dockPanelTerminal.classList.add("active");
    } else if (tabName === "waveform") {
      dockTabWaveform.classList.add("active");
      dockPanelWaveform.classList.add("active");

      // Notify Surfer of visible container dimensions
      requestAnimationFrame(() => notifyWaveformResize());
      setTimeout(() => notifyWaveformResize(), 60);

      if (activeWaveformViewer === "canvas" && lastVcdText && window.renderVcdOnCanvas) {
        setTimeout(() => window.renderVcdOnCanvas(lastVcdText), 50);
      }
    } else if (tabName === "results") {
      dockTabResults.classList.add("active");
      dockPanelResults.classList.add("active");
    }
  }

  dockTabDiagnostics.addEventListener("click", () => switchDockTab("diagnostics"));
  dockTabTerminal.addEventListener("click", () => switchDockTab("terminal"));
  dockTabWaveform.addEventListener("click", () => switchDockTab("waveform"));
  dockTabResults.addEventListener("click", () => switchDockTab("results"));

  // Observe Waveform wrap resizing to reflow Surfer WASM automatically
  if (window.ResizeObserver && surferFrameWrap) {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          notifyWaveformResize();
        }
      }
    });
    ro.observe(surferFrameWrap);
  }

  window.addEventListener("resize", () => {
    refreshEditors();
    notifyWaveformResize();
  });

  if (btnClearDock) {
    btnClearDock.addEventListener("click", () => {
      terminalOutput.textContent = "Console cleared.\n";
      diagnosticsContainer.innerHTML = `
        <div class="diagnostic-card success">
          <span class="diag-loc">System</span>
          <span class="diag-msg">Diagnostics cleared. Ready for next run.</span>
        </div>`;
      if (dockDiagBadge) {
        dockDiagBadge.textContent = "0";
        dockDiagBadge.className = "dock-badge";
      }
    });
  }

  // ==========================================
  // 9. VLSI Backend Integration & Execution
  // ==========================================

  const API_BASE = window.KILBSYS_API_BASE ||
    (typeof localStorage !== "undefined" && localStorage.getItem("kilbsys_api_base")) ||
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:"
      ? "http://127.0.0.1:8000"
      : "https://kilbsys-1.onrender.com");
  window.API_BASE = API_BASE;


  async function checkBackendHealth() {
    try {
      const resp = await fetch(`${API_BASE}/api/health`, { method: "GET" });
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === "ok") {
          statusBackendPill.className = "status-indicator";
          statusBackendText.textContent = "Backend: Online";
          return true;
        }
      }
    } catch (e) {}

    statusBackendPill.className = "status-indicator offline";
    statusBackendText.textContent = "Backend: Offline (Check port 8000)";
    return false;
  }

  function appendTerminalLog(message) {
    if (!terminalOutput) return;
    const ts = new Date().toLocaleTimeString();
    const lines = (message || "").split("\n");
    const frag = document.createDocumentFragment();

    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      const isErr = lower.includes("%error") || lower.includes("error:") || lower.includes("assertion failed") || lower.includes("assertion failure") || lower.includes("fatal:");
      const div = document.createElement("div");
      if (isErr) {
        div.className = "terminal-error-line";
      }
      div.textContent = (idx === 0 ? `[${ts}] ` : "  ") + line;
      frag.appendChild(div);
    });

    terminalOutput.appendChild(frag);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  function renderDiagnostics(diagnostics) {
    if (!diagnosticsContainer) return;
    diagnosticsContainer.innerHTML = "";

    // Clear previous error line highlights in editors
    if (window._highlightedErrorLines) {
      window._highlightedErrorLines.forEach(({ editor, line }) => {
        try { editor.removeLineClass(line, "background", "cm-error-line"); } catch (e) {}
      });
    }
    window._highlightedErrorLines = [];

    let errorCount = 0;
    let warnCount = 0;

    if (!diagnostics || diagnostics.length === 0) {
      diagnosticsContainer.innerHTML = `
        <div class="diagnostic-card success">
          <span class="diag-loc">Validation</span>
          <span class="diag-msg">✓ No syntax or logic errors detected. Synthesizable Verilog verified.</span>
        </div>`;
      if (dockDiagBadge) {
        dockDiagBadge.textContent = "0";
        dockDiagBadge.className = "dock-badge";
      }
      return;
    }

    diagnostics.forEach((d) => {
      const severity = (d.severity || "error").toLowerCase();
      if (severity === "error") errorCount++;
      else warnCount++;

      // Highlight line with red marker in editor if line number exists
      if (severity === "error" && typeof d.line === "number" && d.line > 0) {
        const lineIdx = d.line - 1;
        const targetEd = (d.file && d.file.includes("testbench")) ? testbenchEditor : rtlEditor;
        try {
          targetEd.addLineClass(lineIdx, "background", "cm-error-line");
          window._highlightedErrorLines.push({ editor: targetEd, line: lineIdx });
        } catch (e) {}
      }

      const card = document.createElement("div");
      card.className = `diagnostic-card ${severity}`;

      const locText = d.file && d.line ? `${d.file}:${d.line}${d.column ? `:${d.column}` : ""}` : d.line ? `Line ${d.line}` : "RTL";

      card.innerHTML = `
        <span class="diag-loc">${locText}</span>
        <span class="diag-msg">${escapeHtml(d.message || "Unknown error")}</span>
      `;

      card.style.cursor = "pointer";
      card.title = "Click to jump to line";
      card.addEventListener("click", () => {
        if (d.line) {
          const isTb = d.file && d.file.includes("testbench");
          const targetEd = isTb ? testbenchEditor : rtlEditor;
          if (isTb) {
            setViewMode("testbench");
          } else {
            setViewMode("rtl");
          }
          const col = typeof d.column === "number" && d.column > 0 ? d.column - 1 : 0;
          targetEd.setCursor({ line: Math.max(0, d.line - 1), ch: col });
          targetEd.focus();
        }
      });

      diagnosticsContainer.appendChild(card);
    });

    if (dockDiagBadge) {
      dockDiagBadge.textContent = String(errorCount + warnCount);
      dockDiagBadge.className = `dock-badge ${errorCount > 0 ? "has-errors" : "has-warnings"}`;
    }
  }

  // Check RTL Action
  async function performCheckRtl() {
    const rtlCode = rtlEditor.getValue();
    if (!rtlCode.trim()) {
      switchDockTab("diagnostics");
      renderDiagnostics([{ severity: "error", line: 1, message: "Enter RTL code before validating." }]);
      return;
    }

    statusValidationText.textContent = "Validation: Checking...";
    statusSystemState.textContent = "Validating...";
    appendTerminalLog(`Validating RTL module '${getActiveProject().moduleName || "top"}' with Verilator...`);

    const activeProj = getActiveProject();
    const sourceFilename = (activeProj && activeProj.filename)
      ? activeProj.filename
      : (languageSelect.value === "verilog" ? "design.v" : "design.sv");

    try {
      const response = await fetch(`${API_BASE}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: languageSelect.value,
          top_module: null,
          files: [
            {
              name: sourceFilename,
              code: rtlCode
            }
          ]
        })
      });

      const result = await response.json();
      switchDockTab("diagnostics");

      if (result.passed) {
        statusValidationText.textContent = "Validation: Passed";
        statusSystemState.textContent = "Ready";
        renderDiagnostics([]);
        appendTerminalLog(`✓ RTL validation passed in ${result.elapsed_seconds || 0.05}s.`);
      } else {
        statusValidationText.textContent = "Validation: Errors";
        statusSystemState.textContent = "Validation Error";
        renderDiagnostics(result.diagnostics);
        appendTerminalLog(`✗ Validation failed with ${result.diagnostics ? result.diagnostics.length : 1} issue(s).`);
      }

      // KILBSYS AI: Automatic RTL explanation (non-blocking, after deterministic result)
      invokeAiExplainRtl(
        rtlCode,
        languageSelect.value,
        result.diagnostics || [],
        !!result.passed
      );
    } catch (err) {
      statusValidationText.textContent = "Validation: Network Error";
      statusSystemState.textContent = "Backend Unreachable";
      switchDockTab("diagnostics");
      renderDiagnostics([
        {
          severity: "error",
          line: 0,
          message: `Could not connect to FastAPI server at ${API_BASE}. Please ensure the backend is running.`
        }
      ]);
      appendTerminalLog(`ERROR: Connection to backend failed at ${API_BASE}.`);
    }
  }

  // Run Simulation Action
  async function performRunSimulation() {
    const rtlCode = rtlEditor.getValue();
    const tbCode = testbenchEditor.getValue();

    if (!rtlCode.trim()) {
      switchDockTab("diagnostics");
      renderDiagnostics([{ severity: "error", line: 1, message: "Enter RTL code before running simulation." }]);
      return;
    }

    if (!tbCode.trim()) {
      switchDockTab("diagnostics");
      renderDiagnostics([{ severity: "error", line: 1, message: "Enter Testbench code before running simulation." }]);
      return;
    }

    statusSimulationText.textContent = "Simulation: Running...";
    statusSystemState.textContent = "Simulating...";
    switchDockTab("terminal");
    appendTerminalLog("Starting testbench simulation pipeline...");

    try {
      const response = await fetch(`${API_BASE}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rtl_code: rtlCode,
          testbench_code: tbCode,
          top_module: null
        })
      });

      const result = await response.json();
      lastSimulationResult = result;

      const hasTbFailure = !!result.has_tb_failure;

      if (result.success && !hasTbFailure) {
        const isVerified = result.verdict === "passed_verified";

        if (isVerified) {
          statusSimulationText.textContent = "Simulation: Passed (Verified)";
          statusSystemState.textContent = "Ready";
          appendTerminalLog(`✓ Simulation completed with verified test assertions:\n${result.output || "Clean run"}`);

          resultsStatusCard.className = "diagnostic-card success";
          resultsStatusText.textContent = "✓ Testbench passed: Assertions verified successfully.";
          resultsLogText.textContent = result.output || "All assertions passed.";
        } else {
          statusSimulationText.textContent = "Simulation: Completed (Unchecked)";
          statusSystemState.textContent = "Ready";
          appendTerminalLog(`✓ Simulation cycles completed (no assertions/checks detected):\n${result.output || "Clean run"}`);

          resultsStatusCard.className = "diagnostic-card warning";
          resultsStatusText.textContent = "ℹ Simulation completed cycles. Note: Testbench contains no assertions to verify functional correctness.";
          resultsLogText.textContent = result.output || "Cycles simulated. Functional correctness unverified.";
        }

        addSimulationSession(getActiveProject().name, "passed", result.output || "Success");

        // Handle Waveforms
        if (result.waveform_url) {
          appendTerminalLog(`Waveform generated: ${result.waveform_url}`);
          if (vcdDownloadLink) {
            vcdDownloadLink.href = result.waveform_url;
            vcdDownloadLink.style.pointerEvents = "auto";
            vcdDownloadLink.style.opacity = "1";
          }
          if (surferFrame) {
            const viewerUrl = `${window.location.origin}/viewer/?load_url=${encodeURIComponent(result.waveform_url)}#dev`;
            surferFrame.src = viewerUrl;
          }

          if (waveformEmptyState) waveformEmptyState.style.display = "none";
          if (activeWaveformViewer === "canvas") {
            if (surferFrameWrap) surferFrameWrap.style.display = "none";
            if (waveformCanvasView) waveformCanvasView.style.display = "flex";
            if (canvasControlsGroup) canvasControlsGroup.style.display = "flex";
          } else {
            if (surferFrameWrap) surferFrameWrap.style.display = "block";
            if (waveformCanvasView) waveformCanvasView.style.display = "none";
            if (canvasControlsGroup) canvasControlsGroup.style.display = "none";
          }

          // Fetch VCD for Canvas fallback
          const vcdFetchUrl = result.waveform_url.startsWith("http")
            ? result.waveform_url.replace("http://127.0.0.1:8000", API_BASE)
            : `${API_BASE}${result.waveform_url.startsWith('/') ? '' : '/'}${result.waveform_url}`;
          fetch(vcdFetchUrl)
            .then((r) => {
              if (!r.ok) throw new Error("HTTP " + r.status);
              return r.text();
            })
            .then((vcd) => {
              if (!vcd || vcd.trim().length === 0) {
                lastVcdText = null;
                appendTerminalLog("Diagnostic: VCD file returned from simulator is empty.");
                return;
              }
              lastVcdText = vcd;
              if (window.renderVcdOnCanvas && activeWaveformViewer === "canvas") {
                setTimeout(() => window.renderVcdOnCanvas(vcd), 50);
              }
            })
            .catch((err) => {
              appendTerminalLog(`Diagnostic: Could not load VCD file for fallback (${err.message}).`);
            });

          switchDockTab("waveform");
        } else {
          appendTerminalLog("Notice: No waveform VCD file generated (missing $dumpfile / $dumpvars in testbench).");
          if (waveformEmptyState) waveformEmptyState.style.display = "flex";
          if (surferFrameWrap) surferFrameWrap.style.display = "none";
          if (waveformCanvasView) waveformCanvasView.style.display = "none";
          if (vcdDownloadLink) {
            vcdDownloadLink.removeAttribute("href");
            vcdDownloadLink.style.pointerEvents = "none";
            vcdDownloadLink.style.opacity = "0.4";
          }
          switchDockTab("results");
        }
      } else {
        const stage = result.failure_stage;
        let failLabel = "Simulation Failed";
        let failMsg = "✗ Simulation compilation or runtime failed.";

        if (stage === "rtl_compile") {
          failLabel = "RTL Compile Error";
          failMsg = "✗ Verilator RTL Compilation failed.";
        } else if (stage === "tb_compile") {
          failLabel = "Testbench Compile Error";
          failMsg = "✗ Verilator Testbench Compilation failed.";
        } else if (stage === "both_compile") {
          failLabel = "Compilation Error";
          failMsg = "✗ RTL and Testbench Compilation failed.";
        } else if (stage === "timeout" || stage === "runtime_timeout") {
          failLabel = "Simulation Timeout";
          failMsg = "✗ Simulation exceeded 30-second time limit (check for infinite loops).";
        } else if (stage === "assertion_failure" || hasTbFailure) {
          failLabel = "Assertion Failure";
          failMsg = "✗ Testbench Assertion Failure detected in simulation output.";
        } else {
          failLabel = "Simulation Error";
          failMsg = "✗ Simulator process failed.";
        }

        statusSimulationText.textContent = `Simulation: ${failLabel}`;
        statusSystemState.textContent = failLabel;
        appendTerminalLog(`${failMsg}\n${result.output || ""}`);

        resultsStatusCard.className = "diagnostic-card error";
        resultsStatusText.textContent = failMsg;
        resultsLogText.textContent =
          (result.output || "") +
          "\n" +
          (result.diagnostics ? result.diagnostics.map((d) => `${d.severity}: ${d.message}`).join("\n") : "");

        if (result.diagnostics && result.diagnostics.length > 0) {
          renderDiagnostics(result.diagnostics);
          switchDockTab("diagnostics");
        } else {
          switchDockTab(hasTbFailure ? "results" : "terminal");
        }

        if (waveformEmptyState) waveformEmptyState.style.display = "flex";
        if (surferFrameWrap) surferFrameWrap.style.display = "none";
        if (waveformCanvasView) waveformCanvasView.style.display = "none";

        addSimulationSession(getActiveProject().name, "failed", result.output || failMsg);
      }

      // KILBSYS AI: Automatic simulation analysis (non-blocking, after deterministic result)
      invokeAiAnalyseSim(
        rtlCode,
        tbCode,
        result.output || "",
        result.diagnostics || [],
        !!result.success,
        hasTbFailure
      );
    } catch (err) {
      statusSimulationText.textContent = "Simulation: Network Error";
      statusSystemState.textContent = "Backend Unreachable";
      appendTerminalLog(`ERROR: Could not communicate with simulation server at ${API_BASE}.`);
    }
  }

  // Waveform View Switcher (Surfer WASM vs Canvas)
  if (btnSwitchViewer) {
    btnSwitchViewer.addEventListener("click", () => {
      if (activeWaveformViewer === "surfer") {
        activeWaveformViewer = "canvas";
        btnSwitchViewer.textContent = "Switch to Surfer Viewer";
        surferFrameWrap.style.display = "none";
        waveformCanvasView.style.display = "flex";
        canvasControlsGroup.style.display = "flex";
        if (lastVcdText && window.renderVcdOnCanvas) {
          setTimeout(() => {
            window.renderVcdOnCanvas(lastVcdText);
          }, 50);
        }
      } else {
        activeWaveformViewer = "surfer";
        btnSwitchViewer.textContent = "Switch to Canvas Viewer";
        surferFrameWrap.style.display = "block";
        waveformCanvasView.style.display = "none";
        canvasControlsGroup.style.display = "none";
        requestAnimationFrame(() => notifyWaveformResize());
        setTimeout(() => notifyWaveformResize(), 60);
      }
    });
  }

  // ==========================================
  // 10. KILBSYS AI — Milestone 3
  //     Automated RTL Verification & Intelligent Debugging
  // ==========================================

  // --- DOM references for AI panel ---
  const aiStatusBadge        = document.getElementById("ai-status-badge");
  const aiOnlineIndicator    = document.getElementById("ai-online-indicator");
  const kilbsysLogo          = document.getElementById("kilbsys-logo");
  const aiCorrectionPanel    = document.getElementById("ai-correction-panel");
  const aiCorrectionStatus   = document.getElementById("ai-correction-status");
  const aiCorrectionDiff     = document.getElementById("ai-correction-diff");
  const btnApplyCorrection   = document.getElementById("btn-apply-correction");
  const btnUndoCorrection    = document.getElementById("btn-undo-correction");
  const btnDismissCorrection = document.getElementById("btn-dismiss-correction");

  // Per-session state for correction management
  let _pendingCorrectedCode  = null;  // candidate from AI before verification
  let _verifiedCorrectedCode = null;  // passed revalidation or resimulation
  let _preApplyRtlSnapshot   = null;  // original RTL code before apply (for Undo)
  let _preApplyTbSnapshot    = null;  // original TB code before apply (for Undo)
  let _correctionTarget      = "rtl"; // 'rtl' | 'testbench'
  let _aiRequestCounter      = 0;     // prevent stale responses overwriting fresh ones

  // Helper to infer if code is RTL or Testbench
  function detectCodeTarget(code) {
    if (!code) return "rtl";
    const lower = code.toLowerCase();
    if (
      lower.includes("_tb") ||
      lower.includes("$dumpfile") ||
      lower.includes("$dumpvars") ||
      lower.includes("$finish") ||
      lower.includes("testbench") ||
      (lower.includes("uut") && lower.includes("initial"))
    ) {
      return "testbench";
    }
    return "rtl";
  }

  // --- Official PNG Logo integration hook ---
  // When the client supplies an official PNG, set KILBSYS_LOGO_URL to its path.
  // Note: Per client compliance, no generic icon is substituted if absent.
  const KILBSYS_LOGO_URL = ""; // e.g. "assets/kilbsys-logo.png"
  (function initLogo() {
    if (KILBSYS_LOGO_URL && kilbsysLogo) {
      kilbsysLogo.src = KILBSYS_LOGO_URL;
      kilbsysLogo.style.display = "inline";
    }
  })();

  // --- AI availability probe ---
  let _aiAvailable = false;

  async function checkAiStatus() {
    try {
      const resp = await fetch(`${API_BASE}/api/ai/status`, { method: "GET" });
      if (!resp.ok) throw new Error("non-ok");
      const data = await resp.json();
      _aiAvailable = !!data.ai_available;
      if (aiStatusBadge) {
        aiStatusBadge.textContent = _aiAvailable ? "Online" : "Unavailable";
        aiStatusBadge.className = `ai-provider-badge ${_aiAvailable ? "online" : "offline"}`;
      }
      if (aiOnlineIndicator) {
        aiOnlineIndicator.textContent = _aiAvailable ? "Online" : "Unavailable";
      }
    } catch {
      _aiAvailable = false;
      if (aiStatusBadge) {
        aiStatusBadge.textContent = "Offline";
        aiStatusBadge.className = "ai-provider-badge offline";
      }
      if (aiOnlineIndicator) aiOnlineIndicator.textContent = "Offline";
    }
  }

  // --- Message rendering ---
  function appendAiMessage(role, htmlContent, headerLabel) {
    const msg = document.createElement("div");
    msg.className = `ai-message ${role}`;

    const label = headerLabel || (role === "assistant" ? "KILBSYS AI" : "You");

    if (role === "assistant") {
      // Create copy button
      const copyBtn = document.createElement("button");
      copyBtn.className = "sidebar-action-btn";
      copyBtn.title = "Copy message";
      copyBtn.textContent = "📋";
      copyBtn.style.opacity = "0.7";
      copyBtn.addEventListener("click", () => {
        const text = msg.querySelector("div:last-child") ? msg.querySelector("div:last-child").innerText : htmlContent;
        navigator.clipboard.writeText(text).catch(() => {});
        showStatusNotification("KILBSYS AI response copied.");
      });

      const header = document.createElement("div");
      header.className = "ai-message-header";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = label;
      header.appendChild(nameSpan);
      header.appendChild(copyBtn);

      const body = document.createElement("div");
      body.innerHTML = htmlContent;

      msg.appendChild(header);
      msg.appendChild(body);
    } else {
      msg.textContent = htmlContent;
    }

    aiChatHistory.appendChild(msg);
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
    return msg;
  }

  function appendAiThinkingMessage(label) {
    const msg = document.createElement("div");
    msg.className = "ai-message assistant thinking";

    const header = document.createElement("div");
    header.className = "ai-message-header";
    header.innerHTML = `<span>${label || "KILBSYS AI"}</span><span class="ai-loading-dots">Analysing</span>`;

    msg.appendChild(header);
    aiChatHistory.appendChild(msg);
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
    return msg;
  }

  function removeThinkingMessage(thinkingEl) {
    if (thinkingEl && thinkingEl.parentNode === aiChatHistory) {
      aiChatHistory.removeChild(thinkingEl);
    }
  }

  // --- Markdown-lite rendering for AI responses ---
  function renderAiMarkdown(text) {
    if (!text) return "";
    // Fenced code blocks
    text = text.replace(/```(?:verilog|systemverilog|sv)?\n?([\s\S]*?)```/g,
      (_, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    // Inline code
    text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
    // Bold
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Line breaks
    text = text.replace(/\n/g, "<br>");
    return text;
  }

  // --- Correction candidate management ---
  function showCorrectionPanel(candidateCode, badgeText, badgeClass, isVerified, targetHint) {
    _pendingCorrectedCode = candidateCode;
    if (isVerified) _verifiedCorrectedCode = candidateCode;
    _correctionTarget = targetHint || detectCodeTarget(candidateCode);

    if (!aiCorrectionPanel) return;
    aiCorrectionPanel.style.display = "flex";
    aiCorrectionStatus.textContent = badgeText;
    aiCorrectionStatus.className = `ai-correction-badge ${badgeClass}`;
    aiCorrectionDiff.textContent = candidateCode || "(no code extracted)";

    if (btnApplyCorrection) {
      const hasCode = !!(candidateCode && candidateCode.trim().length > 0);
      btnApplyCorrection.disabled = !hasCode;
      btnApplyCorrection.style.opacity = hasCode ? "1" : "0.4";
      const targetLabel = _correctionTarget === "testbench" ? "Testbench" : "RTL";
      btnApplyCorrection.textContent = `Apply to ${targetLabel}`;
      btnApplyCorrection.title = `Apply code to ${targetLabel} editor`;
    }
    if (btnUndoCorrection) btnUndoCorrection.style.display = "none";
  }

  function hideCorrectionPanel() {
    if (aiCorrectionPanel) aiCorrectionPanel.style.display = "none";
    _pendingCorrectedCode = null;
    _verifiedCorrectedCode = null;
  }

  if (btnApplyCorrection) {
    btnApplyCorrection.addEventListener("click", () => {
      const code = _pendingCorrectedCode || _verifiedCorrectedCode;
      if (!code) return;

      if (_correctionTarget === "testbench") {
        _preApplyTbSnapshot = testbenchEditor.getValue();
        testbenchEditor.setValue(code);
        setUnsavedChanges(true);
        if (activeViewMode === "rtl") {
          setViewMode("split");
        }
        showStatusNotification("Correction applied to Testbench. Click Undo to revert.");
      } else {
        _preApplyRtlSnapshot = rtlEditor.getValue();
        rtlEditor.setValue(code);
        setUnsavedChanges(true);
        if (activeViewMode === "testbench") {
          setViewMode("split");
        }
        showStatusNotification("Correction applied to RTL. Click Undo to revert.");
      }

      if (btnUndoCorrection) btnUndoCorrection.style.display = "inline-flex";
      btnApplyCorrection.disabled = true;
    });
  }

  if (btnUndoCorrection) {
    btnUndoCorrection.addEventListener("click", () => {
      if (_correctionTarget === "testbench" && _preApplyTbSnapshot !== null) {
        testbenchEditor.setValue(_preApplyTbSnapshot);
        setUnsavedChanges(true);
        _preApplyTbSnapshot = null;
        btnUndoCorrection.style.display = "none";
        if (btnApplyCorrection) btnApplyCorrection.disabled = false;
        showStatusNotification("Correction undone. Original Testbench restored.");
      } else if (_preApplyRtlSnapshot !== null) {
        rtlEditor.setValue(_preApplyRtlSnapshot);
        setUnsavedChanges(true);
        _preApplyRtlSnapshot = null;
        btnUndoCorrection.style.display = "none";
        if (btnApplyCorrection) btnApplyCorrection.disabled = false;
        showStatusNotification("Correction undone. Original RTL restored.");
      }
    });
  }

  if (btnDismissCorrection) {
    btnDismissCorrection.addEventListener("click", hideCorrectionPanel);
  }

  // --- AI RTL Explanation (called automatically from performCheckRtl) ---
  async function invokeAiExplainRtl(rtlCode, language, diagnostics, passed) {
    if (!_aiAvailable) return;

    const myCounter = ++_aiRequestCounter;
    const thinking = appendAiThinkingMessage("⏁ KILBSYS AI — RTL Analysis");

    // Show AI panel
    if (aiSidebar.classList.contains("collapsed")) {
      aiSidebar.classList.remove("collapsed");
      savePanelState();
      updateTopbarPanelButtons();
      refreshEditors();
    }

    try {
      const resp = await fetch(`${API_BASE}/api/ai/explain-rtl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtl_code: rtlCode, language, diagnostics, passed }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (myCounter !== _aiRequestCounter) return; // stale
      removeThinkingMessage(thinking);

      if (!data.ai_available) {
        appendAiMessage("assistant", `<em>KILBSYS AI: ${escapeHtml(data.reason || "Unavailable")}</em>`, "⏁ KILBSYS AI");
        return;
      }

      appendAiMessage("assistant", renderAiMarkdown(data.explanation), "⏁ KILBSYS AI — RTL Check");

      if (data.corrected_rtl) {
        const target = data.target || "rtl";
        hideCorrectionPanel();
        showCorrectionPanel(data.corrected_rtl, "Revalidating...", "thinking", false, target);
        try {
          const valResp = await fetch(`${API_BASE}/api/ai/revalidate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rtl_code: data.corrected_rtl, language }),
          });
          const valData = await valResp.json();
          if (myCounter !== _aiRequestCounter) return;
          if (valData.passed) {
            showCorrectionPanel(data.corrected_rtl, "Verified ✔", "verified", true, target);
            appendAiMessage("assistant",
              "Proposed correction <strong>revalidated successfully</strong>. Click <em>Apply</em> to update your editor.",
              "⏁ KILBSYS AI");
          } else {
            const errCount = valData.error_count || 0;
            // Always allow user to apply to editor for review
            showCorrectionPanel(data.corrected_rtl, `Revalidation warning (${errCount} issues)`, "failed", false, target);
            appendAiMessage("assistant",
              `The proposed correction has ${errCount} compiler warning(s). You can still click <em>Apply</em> to insert it into your editor and inspect it.`,
              "⏁ KILBSYS AI");
          }
        } catch (e) {
          showCorrectionPanel(data.corrected_rtl, "Proposed Fix", "unverified", false, target);
        }
      } else {
        hideCorrectionPanel();
      }
    } catch (err) {
      if (myCounter !== _aiRequestCounter) return;
      removeThinkingMessage(thinking);
      appendAiMessage("assistant",
        `<em>KILBSYS AI could not reach the analysis endpoint: ${escapeHtml(err.message)}</em>`,
        "⏁ KILBSYS AI");
    }
  }

  // --- AI Simulation Analysis (called automatically from performRunSimulation) ---
  async function invokeAiAnalyseSim(rtlCode, tbCode, simOutput, diagnostics, success, hasTbFailure) {
    if (!_aiAvailable) return;

    const myCounter = ++_aiRequestCounter;
    const thinking = appendAiThinkingMessage("⏁ KILBSYS AI — Simulation Analysis");

    if (aiSidebar.classList.contains("collapsed")) {
      aiSidebar.classList.remove("collapsed");
      savePanelState();
      updateTopbarPanelButtons();
      refreshEditors();
    }

    try {
      const resp = await fetch(`${API_BASE}/api/ai/analyse-sim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rtl_code: rtlCode,
          testbench_code: tbCode,
          simulation_output: simOutput,
          diagnostics,
          success,
          has_tb_failure: hasTbFailure,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (myCounter !== _aiRequestCounter) return;
      removeThinkingMessage(thinking);

      if (!data.ai_available) {
        appendAiMessage("assistant", `<em>KILBSYS AI: ${escapeHtml(data.reason || "Unavailable")}</em>`, "⏁ KILBSYS AI");
        return;
      }

      appendAiMessage("assistant", renderAiMarkdown(data.explanation), "⏁ KILBSYS AI — Simulation");

      if (data.corrected_rtl) {
        const target = data.target || detectCodeTarget(data.corrected_rtl);
        hideCorrectionPanel();
        showCorrectionPanel(data.corrected_rtl, "Re-simulating...", "thinking", false, target);
        try {
          // Re-simulate candidate with partner code
          const simResp = await fetch(`${API_BASE}/api/ai/resimulate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidate_code: data.corrected_rtl,
              target: target,
              rtl_code: rtlCode,
              testbench_code: tbCode,
            }),
          });
          const simData = await simResp.json();
          if (myCounter !== _aiRequestCounter) return;

          const candidateOut = (simData.output || "").toLowerCase();
          const candidatePass = simData.success &&
            !["assertion failed", "test failed", "%error", "mismatch"].some(k => candidateOut.includes(k));

          if (candidatePass) {
            showCorrectionPanel(data.corrected_rtl, "Sim Verified ✔", "verified", true, target);
            appendAiMessage("assistant",
              "Proposed correction <strong>re-simulated and verified</strong> successfully. Click <em>Apply</em> to use it.",
              "⏁ KILBSYS AI");
          } else {
            // Re-simulation failed, but ALWAYS allow user to click apply to put it in their editor!
            showCorrectionPanel(data.corrected_rtl, "Candidate Fix", "failed", false, target);
            appendAiMessage("assistant",
              "Proposed candidate generated. Click <em>Apply</em> to load it into your editor to review and run.",
              "⏁ KILBSYS AI");
          }
        } catch (e) {
          showCorrectionPanel(data.corrected_rtl, "Candidate Fix", "unverified", false, target);
        }
      } else {
        hideCorrectionPanel();
      }
    } catch (err) {
      if (myCounter !== _aiRequestCounter) return;
      removeThinkingMessage(thinking);
      appendAiMessage("assistant",
        `<em>KILBSYS AI could not reach the analysis endpoint: ${escapeHtml(err.message)}</em>`,
        "⏁ KILBSYS AI");
    }
  }

  // --- Free-form AI chat handler ---
  async function handleAiQuery(query) {
    if (!query.trim()) return;
    appendAiMessage("user", query, "You");

    if (!_aiAvailable) {
      appendAiMessage("assistant",
        "KILBSYS AI is currently unavailable. Please ensure the backend is running and <code>GEMINI_API_KEY</code> is set in <code>backend/.env</code>.",
        "⏁ KILBSYS AI");
      return;
    }

    const thinking = appendAiThinkingMessage("⏁ KILBSYS AI");
    try {
      const resp = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          rtl_context: rtlEditor.getValue() || null,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      removeThinkingMessage(thinking);
      if (!data.ai_available) {
        appendAiMessage("assistant",
          `<em>KILBSYS AI: ${escapeHtml(data.reason || "Unavailable")}</em>`,
          "⏁ KILBSYS AI");
      } else {
        appendAiMessage("assistant", renderAiMarkdown(data.answer), "⏁ KILBSYS AI");
      }
    } catch (err) {
      removeThinkingMessage(thinking);
      appendAiMessage("assistant",
        `<em>Network error: ${escapeHtml(err.message)}</em>`,
        "⏁ KILBSYS AI");
    }
  }

  // Wire up chat send button and Enter key
  if (aiSendBtn && aiQueryInput) {
    aiSendBtn.addEventListener("click", () => {
      const q = aiQueryInput.value.trim();
      if (!q) return;
      aiQueryInput.value = "";
      handleAiQuery(q);
    });

    aiQueryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const q = aiQueryInput.value.trim();
        if (!q) return;
        aiQueryInput.value = "";
        handleAiQuery(q);
      }
    });
  }

  // Wire quick-action chips
  if (chipExplainCode) {
    chipExplainCode.addEventListener("click", () => {
      const rtl = rtlEditor.getValue().trim();
      if (!rtl) { showStatusNotification("Enter RTL code first."); return; }
      handleAiQuery("Please explain the current Verilog module's architecture and functionality.");
    });
  }
  if (chipDiagnoseError) {
    chipDiagnoseError.addEventListener("click", () => {
      handleAiQuery("Diagnose any current compiler diagnostics and explain each error or warning.");
    });
  }
  if (chipSuggestFix) {
    chipSuggestFix.addEventListener("click", () => {
      handleAiQuery("Suggest a synthesisable fix for the current RTL issues.");
    });
  }

  // ==========================================
  // 11. Modal Dialogs & Project Creation
  // ==========================================

  function isDefaultOrEmptyRtl(code) {
    if (!code || !code.trim()) return true;
    const trimmed = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "").trim();
    return trimmed.length < 50;
  }

  // New Project Button click
  if (btnNewProject) {
    btnNewProject.addEventListener("click", () => {
      if (newProjectNameInput) {
        newProjectNameInput.value = "";
      }
      if (newProjectError) {
        newProjectError.textContent = "";
      }
      newProjectModal.classList.remove("hidden");
      if (newProjectNameInput) newProjectNameInput.focus();
    });
  }

  if (btnCancelNewProject) {
    btnCancelNewProject.addEventListener("click", () => {
      newProjectModal.classList.add("hidden");
    });
  }

  // Create Project Form Submit
  if (newProjectForm) {
    newProjectForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = newProjectNameInput.value.trim();
      const language = newProjectLangSelect.value;
      const rawFilename = newProjectFilenameInput ? newProjectFilenameInput.value.trim() : "";

      if (!name) {
        newProjectError.textContent = "Please enter a valid project name.";
        return;
      }

      // Check for duplicate project name
      const duplicate = projects.some((p) => p.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        newProjectError.textContent = `A project named '${name}' already exists. Choose a unique name.`;
        return;
      }

      let moduleName = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
      if (!/^[a-zA-Z_]/.test(moduleName)) {
        moduleName = "mod_" + moduleName;
      }

      // Validate filename
      const defaultExt = language === "systemverilog" ? ".sv" : ".v";
      let filename = rawFilename;
      if (!filename) {
        filename = `${moduleName}${defaultExt}`;
      } else {
        if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
          newProjectError.textContent = "Filename can only contain letters, numbers, underscores, dashes, and dots.";
          return;
        }
        if (!filename.endsWith(".v") && !filename.endsWith(".sv")) {
          filename += defaultExt;
        }
      }

      newProjectModal.classList.add("hidden");

      // Auto-save current project so student work is never lost
      if (hasUnsavedChanges) {
        saveCurrentProject();
      }

      // Create pure minimal module structure
      createNewProject(name, language, moduleName, filename);
    });
  }

  function createNewProject(name, language, moduleName, filename) {
    const newId = "proj_" + Date.now();
    const defaultExt = language === "systemverilog" ? ".sv" : ".v";
    const resolvedFilename = filename || `${moduleName}${defaultExt}`;

    const starterRtl = `module ${moduleName} (
  // Inputs and Outputs

);

  // Write your logic here

endmodule
`;

    const starterTb = `module ${moduleName}_tb;

  // Testbench signals

  // Device Under Test (DUT)
  ${moduleName} uut (

  );

  initial begin
    $dumpfile("waveform.vcd");
    $dumpvars(0, ${moduleName}_tb);

    // Add stimulus here

    #100 $finish;
  end

endmodule
`;

    const newProject = {
      id: newId,
      name,
      language,
      moduleName,
      filename: resolvedFilename,
      rtl: starterRtl,
      testbench: starterTb,
      updatedAt: Date.now()
    };

    projects.unshift(newProject);
    saveProjectsToStorage();
    switchProject(newId);
    showStatusNotification(`Project '${name}' (${resolvedFilename}) created.`);
  }

  // Prevent accidental student data loss on browser refresh
  window.addEventListener("beforeunload", () => {
    if (hasUnsavedChanges) {
      const p = getActiveProject();
      if (p) {
        p.rtl = rtlEditor.getValue();
        p.testbench = testbenchEditor.getValue();
        p.language = languageSelect.value;
        p.updatedAt = Date.now();
        saveProjectsToStorage();
      }
    }
  });

  // Template Confirm Modal Handlers (Preserved if invoked manually)
  if (confirmReplaceBtn) {
    confirmReplaceBtn.addEventListener("click", () => {
      templateConfirmModal.classList.add("hidden");
    });
  }

  if (confirmKeepBtn) {
    confirmKeepBtn.addEventListener("click", () => {
      templateConfirmModal.classList.add("hidden");
    });
  }

  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener("click", () => {
      templateConfirmModal.classList.add("hidden");
    });
  }

  // Delete Project Modal
  function openDeleteModal(id, name) {
    if (projects.length <= 1) {
      alert("Cannot delete the only project in the workspace.");
      return;
    }
    pendingDeleteProjectId = id;
    if (deleteProjectName) deleteProjectName.textContent = name;
    deleteConfirmModal.classList.remove("hidden");
  }

  if (btnCancelDelete) {
    btnCancelDelete.addEventListener("click", () => {
      deleteConfirmModal.classList.add("hidden");
      pendingDeleteProjectId = null;
    });
  }

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener("click", () => {
      if (pendingDeleteProjectId) {
        projects = projects.filter((p) => p.id !== pendingDeleteProjectId);
        saveProjectsToStorage();
        if (activeProjectId === pendingDeleteProjectId) {
          switchProject(projects[0].id);
        } else {
          renderProjectList();
        }
        deleteConfirmModal.classList.add("hidden");
        pendingDeleteProjectId = null;
        showStatusNotification("Project deleted.");
      }
    });
  }

  // Quick Template Item clicks
  if (templateQuickList) {
    templateQuickList.addEventListener("click", (e) => {
      const item = e.target.closest(".sidebar-item");
      if (!item) return;
      const tmpl = item.getAttribute("data-template");

      if (tmpl === "half_adder") {
        const found = projects.find((p) => p.id === "proj_half_adder" || p.moduleName === "half_adder");
        if (found) {
          switchProject(found.id);
        } else {
          createNewProject("Half Adder", "verilog", "half_adder", true);
        }
      } else if (tmpl === "dff") {
        switchProject("proj_dff");
      } else if (tmpl === "counter") {
        switchProject("proj_counter");
      } else if (tmpl === "and_gate") {
        createNewProject("AND Gate", "verilog", "and_gate", true);
      }
    });
  }

  // Search filter
  if (sidebarSearch) {
    sidebarSearch.addEventListener("input", (e) => {
      renderProjectList(e.target.value);
    });
  }

  // ==========================================
  // 12. Helper Utilities & Global Actions
  // ==========================================

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showStatusNotification(msg) {
    if (statusSystemState) {
      const prev = statusSystemState.textContent;
      statusSystemState.textContent = msg;
      setTimeout(() => {
        statusSystemState.textContent = prev;
      }, 3000);
    }
  }

  // Workspace actions
  if (btnSaveProject) {
    btnSaveProject.addEventListener("click", saveCurrentProject);
  }

  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", () => {
      const activeCode = activeViewMode === "testbench" ? testbenchEditor.getValue() : rtlEditor.getValue();
      navigator.clipboard.writeText(activeCode);
      showStatusNotification("Code copied to clipboard!");
    });
  }

  if (btnCheckRtl) {
    btnCheckRtl.addEventListener("click", performCheckRtl);
  }

  if (btnRunSim) {
    btnRunSim.addEventListener("click", performRunSimulation);
  }

  if (btnViewRtl) btnViewRtl.addEventListener("click", () => setViewMode("rtl"));
  if (btnViewTestbench) btnViewTestbench.addEventListener("click", () => setViewMode("testbench"));
  if (btnViewSplit) btnViewSplit.addEventListener("click", () => setViewMode("split"));

  if (languageSelect) {
    languageSelect.addEventListener("change", () => {
      const p = getActiveProject();
      if (p) p.language = languageSelect.value;
      updateLanguageBadges();
      setUnsavedChanges(true);
    });
  }

  // Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    // Ctrl+S: Save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveCurrentProject();
    }
    // Ctrl+B: Toggle Left Sidebar
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      leftSidebar.classList.toggle("collapsed");
      savePanelState();
      updateTopbarPanelButtons();
      refreshEditors();
    }
    // Ctrl+J: Toggle Output Dock
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
      e.preventDefault();
      outputDock.classList.toggle("collapsed");
      savePanelState();
      updateTopbarPanelButtons();
      refreshEditors();
    }
    // Ctrl+Enter: Check RTL
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      performCheckRtl();
    }
    // Shift+Enter: Run Simulation
    if (e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      performRunSimulation();
    }
    // Escape: Close Modals
    if (e.key === "Escape") {
      newProjectModal.classList.add("hidden");
      templateConfirmModal.classList.add("hidden");
      deleteConfirmModal.classList.add("hidden");
    }
  });

  // ==========================================
  // 13. App Initialization
  // ==========================================

  function initApp() {
    loadSavedProjects();

    let initialId = null;
    try {
      initialId = localStorage.getItem(STORAGE_ACTIVE_ID);
    } catch (e) {}

    if (!initialId || !projects.some((p) => p.id === initialId)) {
      initialId = projects[0].id;
    }

    activeProjectId = initialId;

    initTheme();
    initPanels();

    let savedView = "split";
    try {
      savedView = localStorage.getItem("veriloglab_view_mode") || "split";
    } catch (e) {}
    setViewMode(savedView);

    switchProject(activeProjectId);
    renderHistoryList();

    // Health check and periodic polling
    checkBackendHealth();
    setInterval(checkBackendHealth, 15000);

    // KILBSYS AI: probe availability on startup and every 30s
    checkAiStatus();
    setInterval(checkAiStatus, 30000);

    console.log("VerilogLab KILBSYS AI Milestone 3 IDE successfully initialized.");
  }

  window.addEventListener("DOMContentLoaded", initApp);
})();
