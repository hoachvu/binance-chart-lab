# Binance Chart Lab

Ứng dụng phân tích nến Binance Spot và Futures USDⓈ-M dành cho chủ Site và người được mời. Có MA 20, Bollinger Bands 20/2, RSI 14, Volume, kéo/zoom/đổi khung, WebSocket và lịch sử qua REST, lưu chỉ báo và bố cục trong D1.

## Sử dụng

1. Đăng nhập bằng tài khoản ChatGPT có quyền truy cập Site. Lần truy cập đầu tiên trên Site mới **phải là chủ Site** để nhận quyền quản trị.
2. Chọn Spot hoặc Futures USDⓈ-M, gõ cặp Binance như `BTCUSDT` rồi Enter. Chọn khung; kéo biểu đồ, lăn chuột để zoom. Thanh trạng thái cho biết luồng WebSocket hoặc đồng bộ định kỳ.
3. Bật chỉ báo có sẵn ở tab phân tích. Tab mã cho phép dán Pine Script đơn giản, thử, lưu hoặc xóa. Chỉ báo lưu cho từng người riêng biệt.
4. Chủ Site thêm email ở tab quản lý, **đồng thời** cấp quyền xem Site cho email đó trong giao diện Chia sẻ của Sites. Khi thu hồi quyền cần làm ở cả hai nơi. Không có email nào được mời sẵn.

## Pine Script được hỗ trợ

Một `plot(...)` trên `open`, `high`, `low`, `close`, `volume` hoặc `ta.sma`, `ta.ema`, `ta.rsi`, `ta.stdev` với độ dài nguyên 2–200. Có thể khai báo `length = input.int(20)` và `indicator(..., overlay=false)`. Dòng `//@version=5/6` được chấp nhận như chú thích. Các cú pháp khác bị từ chối rõ ràng; đây không phải môi trường Pine Script đầy đủ, không thể nhập mọi chỉ báo TradingView. Mã được phân tích cú pháp giới hạn, không chạy `eval` hoặc mã JS tùy ý.

## Kiến trúc và giới hạn

- Lịch sử tối đa 500 nến mỗi yêu cầu từ Binance, tải thêm khi xem quá khứ. Bộ nhớ biểu đồ giữ tối đa 3.000 nến.
- Cập nhật nến mở qua WebSocket trực tiếp giữa trình duyệt và Binance; nếu ngắt kết nối, truy vấn REST định kỳ 15 giây và tự kết nối lại. Độ trễ phụ thuộc Binance và mạng người dùng.
- Nguồn REST Spot là `data-api.binance.vision`; Futures USDⓈ-M là `fapi.binance.com`. Không có giao dịch hay API key Binance.
- Site mới xuất bản riêng tư. D1 chứa cấu hình và mã riêng theo ID tài khoản ChatGPT. API kiểm tra thành viên trên máy chủ. Phần cấp quyền trong app không tự cấp quyền truy cập ở tầng Sites.
- Việc giữ mức chi phí bằng 0 phụ thuộc hạn mức Sites, D1, API Binance và số người dùng; chưa xác nhận mức miễn phí vô hạn. Không dùng dữ liệu giả khi nguồn lỗi.

## Phát triển

Chạy `npm run build`. Khi đổi schema, tạo migration bằng `npm run db:generate` và xem SQL trước khi phát hành. Biểu đồ dùng Lightweight Charts theo giấy phép và ghi công TradingView ở footer.
