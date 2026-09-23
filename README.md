# Binance Chart Lab

Website biểu đồ Binance Spot và Futures USDⓈ-M, có nến lịch sử và cập nhật trực tiếp, MA 20, Bollinger Bands 20/2, RSI 14, Volume, kéo/zoom/đổi khung và chỉ báo Pine Script đơn giản.

## Quyền truy cập và lưu dữ liệu

Website được chia sẻ công khai: bất kỳ ai có đường link đều có thể truy cập. Người chưa đăng nhập có thể xem biểu đồ và tạo/lưu chỉ báo tùy chỉnh trong `localStorage` của trình duyệt. Các chỉ báo này chỉ có trên cùng trình duyệt, không đồng bộ giữa thiết bị và sẽ mất nếu người dùng xóa dữ liệu website. Nếu Sites cung cấp danh tính ChatGPT và người dùng đã có bản ghi được cấp quyền trong D1, cấu hình và chỉ báo của họ vẫn dùng kho lưu trữ riêng trên máy chủ. Giao diện không còn yêu cầu thêm email vào danh sách để mở biểu đồ.

## Sử dụng

Nhập cặp như `BTCUSDT`, Enter, chọn Spot hoặc Futures USDⓈ-M rồi chọn khung. Kéo biểu đồ để xem lịch sử, lăn chuột để zoom. Tab chỉ báo bật MA, Bollinger Bands, RSI, Volume. Tab mã cho phép dán, thử và lưu Pine Script thuộc tập con hỗ trợ.

## Pine Script được hỗ trợ

Một `plot(...)` trên `open`, `high`, `low`, `close`, `volume` hoặc `ta.sma`, `ta.ema`, `ta.rsi`, `ta.stdev` với độ dài nguyên 2–200. Có thể khai báo `length = input.int(20)` và `indicator(..., overlay=false)`. Dòng `//@version=5/6` được chấp nhận như chú thích. Các cú pháp khác bị từ chối rõ ràng. Đây không phải môi trường Pine Script đầy đủ; không thể nhập mọi chỉ báo TradingView. Mã được phân tích cú pháp giới hạn, không chạy `eval` hoặc mã JS tùy ý.

## Dữ liệu và giới hạn

Lịch sử tối đa 500 nến mỗi yêu cầu từ Binance; tải thêm khi kéo về quá khứ. Biểu đồ giữ tối đa 3.000 nến. WebSocket trực tiếp giữa trình duyệt và Binance cập nhật nến mở; khi mất kết nối hệ thống thử nối lại và đồng bộ REST định kỳ. Nguồn REST Spot là `data-api.binance.vision`, Futures USDⓈ-M là `fapi.binance.com`. Không có giao dịch, không cần API key Binance. Độ trễ và khả năng tải dữ liệu phụ thuộc Binance, mạng người dùng và hạn mức triển khai. Việc giữ chi phí bằng 0 lâu dài chưa được bảo đảm.

Biểu đồ dùng Lightweight Charts theo giấy phép và ghi công TradingView ở footer.
