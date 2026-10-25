# 4-Bit Counter Design Specification

## Overview
The 4-bit synchronous binary counter is a fundamental sequential circuit used in frequency division, event counting, state machine timing, and address generation in digital VLSI systems.

## Functional Truth Table
| `rst` | `clk` | State Transition | Description |
|:-----:|:-----:|:----------------:|:------------|
| `1` | X | `count <= 4'b0000` | Asynchronous Reset (Overriding) |
| `0` | ↑ (`posedge`) | `count <= count + 1` | Normal Binary Increment |
| `0` | `0` or `1` | `count <= count` | Hold previous count value |

## Arithmetic Rollover
When `count` reaches `4'b1111` (`15`), the next rising clock edge increments it with modulo-16 arithmetic back to `4'b0000` (`0`):
$$\text{count}_{n+1} = (\text{count}_n + 1) \pmod{16}$$
