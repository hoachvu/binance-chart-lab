# Binance Chart Lab

Ứng dụng biểu đồ Binance dùng dữ liệu thị trường theo thời gian thực, được xây dựng để sử dụng cá nhân hoặc chia sẻ bằng đường link.

**Bản đang chạy:** https://binance-chart-lab.vuhoach-idc.chatgpt.site

## Tính năng

- Binance Spot và Futures USDⓈ-M.
- Tìm coin theo ký hiệu như `ETH`, sau đó chọn đúng cặp giao dịch (`ETHUSDT`, `ETHUSDC`, ...).
- Biểu đồ nến có kéo, zoom, tải thêm lịch sử và đổi khung `1m`, `5m`, `15m`, `1h`, `4h`, `1d`.
- Dữ liệu nến cập nhật qua WebSocket Binance và tự đồng bộ lại bằng REST khi mất kết nối.
- Chỉ báo MA, Bollinger Bands, RSI và Volume; có thể bật/tắt và chỉnh tham số.
- Trình soạn chỉ báo tùy chỉnh với một tập con Pine Script an toàn; có thể thử và lưu mã.
- Người chưa đăng nhập vẫn dùng được; cấu hình và chỉ báo tự tạo được lưu trong `localStorage` của trình duyệt.

## Chạy trên máy cá nhân

Yêu cầu:

- Node.js `>= 22.13.0`
- pnpm `11.25.0`

```bash
pnpm install
pnpm dev
```

Kiểm tra trước khi triển khai:

```bash
pnpm lint
pnpm build
```

Ứng dụng không cần Binance API key vì chỉ đọc dữ liệu thị trường công khai.

## Pine Script được hỗ trợ

Trình phân tích hiện hỗ trợ một `plot(...)` trên `open`, `high`, `low`, `close`, `volume` hoặc `ta.sma`, `ta.ema`, `ta.rsi`, `ta.stdev`, với độ dài nguyên từ 2 đến 200. Có thể dùng `length = input.int(20)`, `indicator(..., overlay=false)` và chú thích `//@version=5/6`.

Đây là tập con Pine Script, không phải toàn bộ môi trường Pine của TradingView. Mã không được chạy bằng `eval` và không thể chạy JavaScript tùy ý.

## Dữ liệu và lưu trữ

- Lịch sử tải tối đa 500 nến mỗi yêu cầu; ứng dụng giữ tối đa 3.000 nến trên biểu đồ.
- Spot REST: `data-api.binance.vision`.
- Futures USDⓈ-M REST: `fapi.binance.com`.
- Người dùng công khai: cấu hình nằm trong `localStorage`, không tự đồng bộ giữa trình duyệt hoặc thiết bị.
- Khi chạy trong ChatGPT Sites và có danh tính người dùng, cấu hình có thể lưu trong Cloudflare D1 qua binding `DB`.

Không commit file `.env`, khóa API hoặc token vào repository. Các mẫu bí mật đã được loại khỏi `.gitignore`.

## Triển khai lâu dài

### ChatGPT Sites

File `.openai/hosting.json` liên kết source với dự án Sites hiện tại. Có thể tiếp tục yêu cầu ChatGPT/Codex sửa mã, kiểm thử và xuất bản phiên bản mới lên cùng địa chỉ website.

### Cloudflare Workers

Kiến trúc hiện tại dùng Vinext, Wrangler và D1 nên Cloudflare Workers là hướng tự triển khai phù hợp nhất. Khi chuyển khỏi Sites cần tạo D1 database, chạy migration trong `drizzle/`, khai báo binding `DB` và cấu hình lại phần nhận diện người dùng nếu muốn đồng bộ dữ liệu máy chủ.

Vercel/hosting Node thông thường sẽ cần thay phần D1, runtime Cloudflare và xác thực đặc thù Sites; không phải quy trình triển khai một nút từ source hiện tại.

## Quy trình chỉnh sửa

```bash
git clone <URL_REPOSITORY>
cd binance-chart-lab
pnpm install
pnpm dev
```

Sau khi sửa:

```bash
git add .
git commit -m "Mô tả thay đổi"
git push
```

GitHub là bản sao lưu source lâu dài. Website đang chạy trên Sites không tự cập nhật chỉ vì có commit mới trên GitHub; cần xuất bản lại qua Sites hoặc thiết lập một quy trình triển khai Cloudflare riêng.

## Giấy phép thư viện

Biểu đồ sử dụng Lightweight Charts và hiển thị ghi công TradingView theo giấy phép của thư viện. Dự án này không liên kết với, không được TradingView hoặc Binance bảo trợ.
