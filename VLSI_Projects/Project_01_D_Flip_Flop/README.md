# Project 01: D Flip-Flop (DFF)

## Overview
A positive-edge triggered D Flip-Flop with asynchronous active-high reset, implemented in synthesizable Verilog HDL.

## Directory Structure
```text
Project_01_D_Flip_Flop/
├── README.md               # Project documentation and simulation guide
├── src/
│   └── dff.v               # Primary Verilog RTL source module
├── testbench/
│   └── dff_tb.v            # Testbench module with stimulus and checks
├── simulation/
│   └── waveform.vcd        # Simulation output waveform (Value Change Dump)
└── documentation/
    └── timing_spec.md      # Timing specifications and reset characteristics
```

## Primary Files
- **Main RTL Source**: `src/dff.v` (Module: `dff`)
- **Testbench**: `testbench/dff_tb.v` (Module: `tb`)
- **Simulation Waveform**: `simulation/waveform.vcd`

## Module Interface
| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| `clk` | Input | 1 | Positive-edge clock input |
| `reset` | Input | 1 | Asynchronous active-high reset |
| `d` | Input | 1 | Data input |
| `q` | Output | 1 | Registered output |

## How to Simulate

### Option 1: In VerilogLab Browser EDA
1. Open the VerilogLab IDE (`http://localhost:5173/` or launch `index.html`).
2. Create project `dff_demo` (Verilog).
3. Paste the contents of `src/dff.v` into the Code tab.
4. Click **Validate RTL**.
5. Switch to the Testbench tab and paste `testbench/dff_tb.v`.
6. Click **Run Testbench** to simulate and view the waveform in the interactive Surfer viewer or canvas fallback.

### Option 2: Using Icarus Verilog (CLI)
```bash
iverilog -o dff_sim.vvp src/dff.v testbench/dff_tb.v
vvp dff_sim.vvp
# Open simulation/waveform.vcd in GTKWave or Surfer
```

### Option 3: Using Verilator
```bash
verilator --binary --timing --trace --top-module tb src/dff.v testbench/dff_tb.v -o simulation/dff_sim
./simulation/dff_sim
```
