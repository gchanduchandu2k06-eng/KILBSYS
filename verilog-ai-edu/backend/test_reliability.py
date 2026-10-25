"""
Regression test suite for VerilogLab / KILBSYS Reliability Milestone.
Tests all compiler, simulation, diagnostic, verdict, and AI reliability requirements.
"""

import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_health():
    resp = requests.get(f"{BASE_URL}/api/health")
    assert resp.status_code == 200, f"Health check failed: {resp.text}"
    assert resp.json().get("status") == "ok"
    print("PASS: 1. Health check ok")

def test_compile_valid_inverter():
    code = """
module inverter (
  input wire a,
  output wire y
);
  assign y = ~a;
endmodule
"""
    resp = requests.post(
        f"{BASE_URL}/api/validate",
        json={
            "language": "verilog",
            "top_module": None,
            "files": [{"name": "inverter.v", "code": code}],
        },
    )
    assert resp.status_code == 200, f"Validation failed: {resp.text}"
    data = resp.json()
    assert data["passed"] is True, f"Expected passed=True, got {data}"
    assert data["error_count"] == 0
    assert len(data["diagnostics"]) == 0
    print("PASS: 2. Valid inverter compilation passed")

def test_half_adder_truth_table():
    rtl = """
module half_adder (
  input wire a,
  input wire b,
  output wire sum,
  output wire carry
);
  assign sum = a ^ b;
  assign carry = a & b;
endmodule
"""
    tb = """
module half_adder_tb;
  reg a, b;
  wire sum, carry;

  half_adder uut (.a(a), .b(b), .sum(sum), .carry(carry));

  initial begin
    $dumpfile("waveform.vcd");
    $dumpvars(0, half_adder_tb);

    a = 0; b = 0; #10;
    if (sum !== 0 || carry !== 0) $display("ASSERTION FAILED at 0,0");

    a = 0; b = 1; #10;
    if (sum !== 1 || carry !== 0) $display("ASSERTION FAILED at 0,1");

    a = 1; b = 0; #10;
    if (sum !== 1 || carry !== 0) $display("ASSERTION FAILED at 1,0");

    a = 1; b = 1; #10;
    if (sum !== 0 || carry !== 1) $display("ASSERTION FAILED at 1,1");

    $display("All half adder truth table tests passed.");
    $finish;
  end
endmodule
"""
    resp = requests.post(
        f"{BASE_URL}/api/simulate",
        json={"rtl_code": rtl, "testbench_code": tb, "top_module": None},
    )
    assert resp.status_code == 200, f"Simulation API failed: {resp.text}"
    data = resp.json()
    assert data["success"] is True, f"Expected success=True, got {data}"
    assert data["has_tb_failure"] is False
    assert data["verdict"] == "passed_verified", f"Expected passed_verified, got {data['verdict']}"
    assert "All half adder truth table tests passed." in data["output"]
    assert data["waveform_url"] is not None
    print("PASS: 3. Half-adder simulation with verified truth table passed")

def test_syntax_error_diagnostics():
    rtl_err = """
module bad_module (
  input wire a
  output wire y
);
  assign y = a;
endmodule
"""
    resp = requests.post(
        f"{BASE_URL}/api/validate",
        json={
            "language": "verilog",
            "top_module": None,
            "files": [{"name": "bad.v", "code": rtl_err}],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["passed"] is False, "Expected compiler failure on missing semicolon"
    assert data["error_count"] > 0
    assert len(data["diagnostics"]) > 0
    first_diag = data["diagnostics"][0]
    assert first_diag["severity"] == "error"
    assert first_diag["line"] in [2, 3, 4]
    print(f"PASS: 4. Syntax error accurately located at line {first_diag['line']}")

def test_sequential_circuit_waveform():
    rtl = """
module dff (
  input wire clk,
  input wire rst,
  input wire d,
  output reg q
);
  always @(posedge clk or posedge rst) begin
    if (rst) q <= 1'b0;
    else q <= d;
  end
endmodule
"""
    tb = """
module dff_tb;
  reg clk, rst, d;
  wire q;

  dff uut (.clk(clk), .rst(rst), .d(d), .q(q));

  initial begin
    $dumpfile("waveform.vcd");
    $dumpvars(0, dff_tb);
    clk = 0;
    forever #5 clk = ~clk;
  end

  initial begin
    rst = 1; d = 0;
    #12 rst = 0;
    #10 d = 1;
    #10 d = 0;
    #10 d = 1;
    #20 $finish;
  end
endmodule
"""
    resp = requests.post(
        f"{BASE_URL}/api/simulate",
        json={"rtl_code": rtl, "testbench_code": tb, "top_module": None},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["waveform_url"] is not None, "Waveform URL must be generated for sequential simulation"
    # Verify the VCD can be downloaded and has content
    vcd_resp = requests.get(data["waveform_url"])
    assert vcd_resp.status_code == 200, f"Failed to download generated VCD: {vcd_resp.status_code}"
    vcd_content = vcd_resp.text
    assert "$scope" in vcd_content and "$var" in vcd_content
    assert "clk" in vcd_content and "rst" in vcd_content and "q" in vcd_content
    print("PASS: 5. Sequential DFF simulation & valid VCD download verified")

def test_deliberate_assertion_failure():
    rtl = """
module failing_design (input wire a, output wire y);
  assign y = a; // Bug: should be ~a
endmodule
"""
    tb = """
module failing_tb;
  reg a;
  wire y;
  failing_design uut (.a(a), .y(y));

  initial begin
    a = 1; #10;
    if (y !== 0) begin
      $display("ASSERTION FAILED: expected 0 but got %b", y);
    end
    $finish;
  end
endmodule
"""
    resp = requests.post(
        f"{BASE_URL}/api/simulate",
        json={"rtl_code": rtl, "testbench_code": tb, "top_module": None},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False, "Deliberate assertion failure must result in success=False"
    assert data["has_tb_failure"] is True
    assert data["verdict"] == "assertion_failure"
    assert "ASSERTION FAILED" in data["output"]
    print("PASS: 6. Testbench assertion failure truthfully flagged as failure")

def test_simulation_without_assertions_is_unverified():
    rtl = """
module simple_counter(input wire clk, output reg [3:0] q);
  initial q = 0;
  always @(posedge clk) q <= q + 1;
endmodule
"""
    tb = """
module simple_counter_tb;
  reg clk;
  wire [3:0] q;
  simple_counter uut (.clk(clk), .q(q));
  initial begin
    clk = 0;
    repeat(10) #5 clk = ~clk;
    $finish;
  end
endmodule
"""
    resp = requests.post(
        f"{BASE_URL}/api/simulate",
        json={"rtl_code": rtl, "testbench_code": tb, "top_module": None},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["verdict"] == "passed_unverified", f"Expected passed_unverified, got {data['verdict']}"
    print("PASS: 7. Simulation without checks truthfully classified as passed_unverified")

def test_testbench_compile_error_isolated():
    rtl = "module ok_rtl(input wire a, output wire y); assign y = a; endmodule"
    bad_tb = "module bad_tb; ok_rtl uut(.a(a), .y(y)) // missing semicolon\nendmodule"
    resp = requests.post(
        f"{BASE_URL}/api/simulate",
        json={"rtl_code": rtl, "testbench_code": bad_tb, "top_module": None},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert data["failure_stage"] == "tb_compile"
    assert any("testbench.v" in (d.get("file") or "") for d in data["diagnostics"])
    print("PASS: 8. Testbench-only compilation error correctly isolated to tb_compile")

def test_revalidation_endpoint():
    good_candidate = "module fix(input wire a, output wire y); assign y = a; endmodule"
    resp = requests.post(
        f"{BASE_URL}/api/ai/revalidate",
        json={"rtl_code": good_candidate, "language": "verilog"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["passed"] is True
    print("PASS: 9. AI candidate revalidation endpoint working")

if __name__ == "__main__":
    print("Running VerilogLab / KILBSYS Reliability Regression Tests...\n")
    test_health()
    test_compile_valid_inverter()
    test_half_adder_truth_table()
    test_syntax_error_diagnostics()
    test_sequential_circuit_waveform()
    test_deliberate_assertion_failure()
    test_simulation_without_assertions_is_unverified()
    test_testbench_compile_error_isolated()
    test_revalidation_endpoint()
    print("\nALL 9 AUTOMATED REGRESSION TESTS PASSED.")
