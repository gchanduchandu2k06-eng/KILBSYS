# VerilogLab (`verilog-ai-edu`) — Browser-Based Verilog EDA & Learning Platform

`verilog-ai-edu` is a browser-based Electronic Design Automation (EDA) and digital logic learning platform. It allows students and engineers to write Verilog and SystemVerilog Register-Transfer Level (RTL) code, check syntax and lint rules with industry-standard Verilator, write testbenches, execute functional simulations, and inspect generated waveform traces (VCD) directly in the browser using WebAssembly.

---

## Table of Contents
1. [Project Overview & Objectives](#project-overview--objectives)
2. [Current Architecture & Component Flow](#current-architecture--component-flow)
3. [Technology Stack](#technology-stack)
4. [Project Directory Structure](#project-directory-structure)
5. [Installation & Local Setup](#installation--local-setup)
6. [Starting the Application](#starting-the-application)
7. [Student Workflow & Usage Guide](#student-workflow--usage-guide)
8. [Verilog Compilation & Simulation Details](#verilog-compilation--simulation-details)
9. [Waveform Inspection (Surfer WASM & Canvas Viewer)](#waveform-inspection-surfer-wasm--canvas-viewer)
10. [Known Limitations & Current Status](#known-limitations--current-status)
11. [Troubleshooting Common Issues](#troubleshooting-common-issues)
12. [Future Enhancement Roadmap](#future-enhancement-roadmap)

---

## 1. Project Overview & Objectives

Learning digital design and hardware description languages (Verilog/SystemVerilog) is traditionally hampered by steep software installation overhead. Commercial and open-source EDA tools (ModelSim, Quartus, Vivado, Icarus Verilog, Verilator, GTKWave) require platform-specific setups, complex license management, or Linux-only environments.

**`verilog-ai-edu` solves this by providing:**
- A zero-installation web IDE accessible from any modern browser.
- Real-time syntax and lint diagnostics powered by **Verilator**.
- In-browser simulation execution with `$display` output capture.
- Automated Value Change Dump (`.vcd`) waveform generation and rendering via an integrated WebAssembly waveform viewer (**Surfer**).
- A planned **Educational AI Assistant** to guide students through syntax errors, timing mismatches, and digital logic concepts.

---

## 2. Current Architecture & Component Flow

The platform utilizes a decoupled client-server architecture:

```
[Browser Client: Port 5173]
  ├── Multi-step SPA UI (Project -> Code -> Testbench -> Output -> Waveform)
  ├── CodeMirror 5 Editor (Verilog Syntax Mode)
  └── Surfer WASM Viewer (Rust/egui in <iframe>)
         │
         │ REST API (JSON)
         ▼
[FastAPI Backend: Port 8000]
  ├── POST /api/validate       -> Runs Verilator lint checks
  ├── POST /api/simulate       -> Injects dumpvars, builds binary, runs simulation
  ├── GET  /vcd/{id}/waveform  -> Serves generated VCD files
  └── GET  /api/health         -> Health check endpoint
         │
         │ Subprocess Execution
         ▼
[EDA Toolchain (WSL Ubuntu)]
  ├── Verilator 5.020 (Syntax linter & C++ compiler)
  ├── GNU g++ & make (Executable linker)
  └── Simulation Executable (Generates waveform.vcd)
```

---

## 3. Technology Stack

- **Backend:**
  - Python 3.12 / 3.14
  - FastAPI 0.104+
  - Uvicorn 0.24+
  - Pydantic v2
  - python-dotenv
- **EDA & Simulation Engine:**
  - **Verilator 5.020** (Debian/Ubuntu packages)
  - **GNU g++ & make** (Required by Verilator for binary compilation)
- **Frontend:**
  - Vanilla HTML5 / CSS3 / JavaScript (ES6+)
  - **CodeMirror 5.65.16** (with Verilog syntax mode)
  - **Surfer** (Precompiled Rust/egui WebAssembly waveform viewer)
  - Custom HTML5 Canvas fallback VCD parser (`waveform.js`)

---

## 4. Project Directory Structure

```
verilog-ai-edu/
├── backend/
│   ├── main.py                  # Primary FastAPI router & static waveform server
│   ├── validation.py            # Verilator linting endpoint (/api/validate)
│   ├── .env                     # Backend configuration (PUBLIC_BASE_URL)
│   ├── services/
│   │   ├── simulator.py         # Simulation execution & VCD trace generation
│   │   └── validator.py         # Alternative validator with undriven port detection
│   ├── waveforms/               # Storage for generated simulation .vcd traces
│   └── uploads/                 # Temporary execution scratch spaces
│
└── frontend/
    ├── index.html               # Main Browser EDA single-page application
    ├── script.js                # Frontend API client & UI state controller
    ├── styles.css               # Styling for editors, output panels, and buttons
    ├── waveform.js              # Canvas-based VCD waveform parser and renderer
    └── viewer/                  # Surfer WebAssembly waveform viewer
        ├── index.html           # Surfer iframe host page
        ├── surfer.js            # Surfer JS loader
        ├── surfer_bg.wasm       # Compiled WebAssembly binary (17.2 MB)
        └── integration.js       # PostMessage & query parameter URL loader
```

---

## 5. Installation & Local Setup

### Prerequisites
1. **Python 3.10+** (with `pip`)
2. **WSL (Windows Subsystem for Linux) with Ubuntu** (for Windows hosts) OR native Linux:
   - Verilator: `sudo apt update && sudo apt install -y verilator make g++`

### Backend Setup
1. Open a terminal (in WSL or Linux where Verilator is installed):
   ```bash
   cd verilog-ai-edu/backend
   python3 -m venv venv
   source venv/bin/activate
   pip install fastapi uvicorn pydantic python-dotenv requests
   ```
2. Verify `.env`:
   ```bash
   echo "PUBLIC_BASE_URL=http://127.0.0.1:8000" > .env
   ```

### Frontend Setup
The frontend uses static files and requires no build step. Any HTTP server will serve it.

---

## 6. Starting the Application

### 1. Launch the Backend Server (Port 8000)
From the `verilog-ai-edu/backend` directory:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Test that the backend is alive:
```bash
curl http://127.0.0.1:8000/api/health
# Response: {"status":"ok"}
```

### 2. Launch the Frontend Server (Port 5173)
From the `verilog-ai-edu/frontend` directory:
```bash
python3 -m http.server 5173 --bind 127.0.0.1
```
Open your browser to: **`http://127.0.0.1:5173/`**

---

## 7. Student Workflow & Usage Guide

1. **Create a Project:**
   - On first load, enter your project module name (e.g., `full_adder`) and choose HDL dialect (`Verilog` or `SystemVerilog`).
   - Click **Create Project**.
2. **Write RTL Code:**
   - The RTL editor opens with a starter template.
   - Enter your module logic (e.g., ports, wires, assigns, or always blocks).
   - Click **Check RTL**.
   - If syntax errors or undriven wires exist, line-by-line diagnostics will appear.
3. **Write Testbench:**
   - Once RTL validation passes, click **Go to Testbench**.
   - Provide a testbench module instantiating your Unit Under Test (UUT) and generating clock/inputs.
4. **Run Simulation:**
   - Click **Run Testbench** (or **Run without Testbench** for basic self-clocking RTL).
   - The app automatically redirects to the **Simulation Output** tab.
   - Review `$display` outputs and check results.
5. **Inspect Waveforms:**
   - Beneath the simulation console, the **Surfer** waveform viewer automatically loads the generated VCD file.
   - Expand `TOP` &rarr; `<module_tb>`, click on the scope, and double-click signals to view digital transitions across simulation time steps.

---

## 8. Verilog Compilation & Simulation Details

The platform uses **Verilator 5.020** configured as follows:
- **Linting Command:**
  ```bash
  verilator --lint-only --timing --assert -Wall -Wno-fatal --error-limit 20 --language 1364-2005 -I. rtl.v
  ```
- **Binary Simulation Command:**
  ```bash
  verilator --binary --timing --trace --Wno-fatal -Wno-DECLFILENAME --Mdir obj_dir --top-module <top> -o simulation design.v testbench.v
  ```
- **Automated VCD Hook:**
  The backend automatically injects the following block into the top-level testbench prior to compilation:
  ```verilog
  initial begin
      $dumpfile("waveform.vcd");
      $dumpvars(0, <top_module_name>);
  end
  ```
- The resulting binary executable is run locally with standard outputs captured and scrubbed of internal Verilator banner lines.

---

## 9. Waveform Inspection (Surfer WASM & Canvas Viewer)

- **Surfer WASM Viewer:**
  Located in `frontend/viewer/`, Surfer is a high-performance waveform viewer written in Rust and compiled to WebAssembly via `egui`. It supports signal searching, radix changes (Hex, Dec, Bin), cursor measurements, and zoom/pan.
- **Canvas Fallback Viewer:**
  `frontend/waveform.js` provides an independent, lightweight HTML5 canvas parser for `.vcd` files if WebAssembly is unavailable or disabled.

---

## 10. Known Limitations & Current Status

| Component | Status | Known Limitation |
| :--- | :--- | :--- |
| **Linting** | Functional | Verilator warnings like `EOFNEWLINE` and `DECLFILENAME` are flagged unless filtered. |
| **Simulation** | Functional | Requires `verilator` with `--timing` support (Verilator v5+). Execution timeout is 30 seconds. |
| **Waveforms** | Functional | Requires `$finish` in testbenches to close and flush the VCD buffer cleanly. |
| **AI Assistant** | In Progress | Planned for Phase 7: Real-time error diagnosis and digital design tutoring. |
| **Storage** | Ephemeral | Projects are stored in browser session memory; no persistent cloud database is currently attached. |

---

## 11. Troubleshooting Common Issues

- **"Could not connect to FastAPI"**:
  - Ensure Uvicorn is running: check `curl http://127.0.0.1:8000/api/health`.
  - Verify port 8000 is open and not blocked by firewall or WSL port-forwarding issues.
- **"Verilator is not installed or is not on PATH"**:
  - Verify Verilator in terminal: `verilator --version`. Must be version 5.000 or newer for `--timing` support.
- **"Waveform viewer shows loading spinner indefinitely"**:
  - Verify that the simulation completed with `$finish;`.
  - Confirm the backend `.env` has `PUBLIC_BASE_URL=http://127.0.0.1:8000` matching the address reachable by the browser.

---

## 12. Future Enhancement Roadmap

1. **Integrated Educational AI Assistant:**
   - Automatic explanation of compiler errors and verilator warnings.
   - Intelligent suggestions for syntax fixes and timing optimizations.
   - Interactive Q&A sidebar for digital design concepts.
2. **Modernized User Interface:**
   - Sleek unified dark-mode IDE interface.
   - Side-by-side or tabbed multi-pane layout (Editor, Console, Waveform, and AI Tutor).
3. **Cloud Project Persistence:**
   - User accounts, saved circuits, and shareable lab assignment links.
