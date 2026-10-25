module counter_tb;

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
  #160;
  
  if (count > 0) begin
    $display("SUCCESS: Counter reached %0d after 16 cycles", count);
  end else begin
    $display("ERROR: Counter failed to increment");
  end
  
  $finish;
end

endmodule
