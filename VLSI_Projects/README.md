# VLSI Design Projects Repository

Welcome to the structured VLSI digital design projects library. This repository contains synthesizable RTL designs, comprehensive behavioral testbenches, simulation outputs, and documentation.

## Projects Catalog

| Project | Description | Main RTL | Testbench | Status |
|---------|-------------|----------|-----------|:------:|
| [Project 01: D Flip-Flop](file:///c:/Users/Hp/OneDrive/Desktop/VLSI%20project/VLSI_Projects/Project_01_D_Flip_Flop) | Positive-edge triggered D-type flip-flop with async reset | `src/dff.v` | `testbench/dff_tb.v` | Verified |
| [Project 02: 4-Bit Counter](file:///c:/Users/Hp/OneDrive/Desktop/VLSI%20project/VLSI_Projects/Project_02_4Bit_Counter) | 4-bit synchronous binary counter with async reset | `src/counter.v` | `testbench/counter_tb.v` | Verified |

---

## Standard Project Directory Conventions

Every project follows a consistent, modular structure:

```text
Project_Name/
├── README.md               # Overview, port descriptions, and execution commands
├── src/                    # Synthesizable RTL source files (.v / .sv)
├── testbench/              # Verification testbenches (.v / .sv)
├── simulation/             # Simulation waveforms (.vcd) and compilation artifacts
└── documentation/          # Circuit diagrams, truth tables, and timing specifications
```

---

## Running Projects in VerilogLab

All designs are 100% compatible with the local **VerilogLab Browser EDA** environment:

1. Launch VerilogLab by opening `index.html` at the workspace root or visiting `http://localhost:5173/`.
2. Enter the project name and HDL language (Verilog / SystemVerilog).
3. Paste the module from `src/` into the Code editor and click **Validate RTL**.
4. Paste the testbench from `testbench/` and click **Run Testbench**.
5. Inspect waveforms in the interactive Surfer viewer or canvas fallback.
