# D Flip-Flop Timing Specification

## Operational Characteristics
- **Clock Trigger**: Rising edge (`posedge clk`).
- **Reset Type**: Asynchronous active-high (`posedge reset`).
- **Reset Priority**: Highest priority; immediately asserts `q <= 1'b0` regardless of `clk` or `d`.
- **Data Capture**: When `reset == 0`, the input state `d` is sampled on `posedge clk` and transferred to output `q`.

## Timing Diagram (ASCII)
```text
clk:    ___/‾‾‾\___/‾‾‾\___/‾‾‾\___/‾‾‾\___
reset:  ‾‾‾‾\______________________________
d:      ______/‾‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾‾____
q:      ___________/‾‾‾‾‾‾‾‾\_______/‾‾‾‾‾‾
```
