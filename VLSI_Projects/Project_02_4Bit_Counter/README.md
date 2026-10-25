# Project 02: 4-Bit Synchronous Binary Counter

## Overview
A 4-bit synchronous up-counter with asynchronous active-high reset. On each rising clock edge, the counter increments its value from `4'b0000` (`0x0`) to `4'b1111` (`0xF`) and rolls over cleanly to `4'b0000`.

## Directory Structure
```text
Project_02_4Bit_Counter/
├── README.md               # Project documentation and simulation guide
├── src/
│   └── counter.v           # Primary Verilog RTL source module
├── testbench/
│   └── counter_tb.v        # Testbench verifying reset, increment, and count
├── simulation/
│   └── waveform.vcd        # Simulation waveform output (Value Change Dump)
└── documentation/
    └── design_spec.md      # Design specifications and truth table
```

## Primary Files
- **Main RTL Source**: `src/counter.v` (Module: `counter`)
- **Testbench**: `testbench/counter_tb.v` (Module: `counter_tb`)
- **Simulation Waveform**: `simulation/waveform.vcd`

## Module Interface
| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| `clk` | Input | 1 | Clock input (posedge active) |
| `rst` | Input | 1 | Asynchronous active-high reset |
| `count` | Output | 4 | 4-bit registered counter value (`[3:0]`) |

## How to Simulate

### Option 1: In VerilogLab Browser EDA
1. Open the VerilogLab IDE (`http://localhost:5173/` or launch `index.html`).
2. Create project `counter_4bit` (Verilog).
3. Paste the contents of `src/counter.v` into the Code tab.
4. Click **Validate RTL**.
5. Switch to the Testbench tab and paste `testbench/counter_tb.v`.
6. Click **Run Testbench** to simulate and view the waveform in the interactive Surfer viewer or canvas fallback.

### Option 2: Using Icarus Verilog (CLI)
```bash
iverilog -o counter_sim.vvp src/counter.v testbench/counter_tb.v
vvp counter_sim.vvp
```

### Option 3: Using Verilator
```bash
verilator --binary --timing --trace --top-module counter_tb src/counter.v testbench/counter_tb.v -o simulation/counter_sim
./simulation/counter_sim
```
