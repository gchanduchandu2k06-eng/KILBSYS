module tb;

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
