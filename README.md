# Binance Chart Lab

Ứng dụng biểu đồ Binance dùng dữ liệu thị trường theo thời gian thực, được xây dựng để sử dụng cá nhân hoặc chia sẻ bằng đường link.

**Bản đang chạy:** https://binance-chart-lab.vuhoach-idc.chatgpt.site

## Tính năng

- Binance Spot và Futures USDⓈ-M.
- Tìm coin theo ký hiệu như `ETH`, sau đó chọn đúng cặp giao dịch (`ETHUSDT`, `ETHUSDC`, ...).
- Biểu đồ nến có kéo, zoom/chụm hai ngón, tải thêm lịch sử và đổi khung `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w`.
- Dữ liệu nến cập nhật qua WebSocket Binance và tự đồng bộ lại bằng REST khi mất kết nối.
- Watchlist kiểu TradingView: nhiều danh sách, thêm/xóa/sắp xếp cặp Spot và Futures, giá cùng biến động 24 giờ theo thời gian thực.
- Giao diện responsive cho điện thoại; watchlist và phần thiết lập mở dạng bảng trượt phía dưới để dành diện tích cho biểu đồ.
- Chỉ báo MA, Bollinger Bands, RSI và Volume; có thể bật/tắt, chỉnh tham số và chọn màu riêng cho từng đường, ngưỡng, vùng nền hoặc cột tăng/giảm.
- Trình soạn chỉ báo tùy chỉnh với một tập con Pine Script an toàn; có thể thử và lưu mã, tối đa 8 đường `plot(...)` với tên và màu riêng.
- Người chưa đăng nhập vẫn dùng được; cấu hình, watchlist và chỉ báo tự tạo được lưu trong `localStorage` của trình duyệt. Thay đổi watchlist được ghi ngay khi thêm, xóa, đổi tên hoặc sắp xếp, và trang nhớ danh sách đang chọn.
- Đăng ký/đăng nhập bằng tên tài khoản và mật khẩu để đồng bộ watchlist, cấu hình và chỉ báo giữa các thiết bị; dữ liệu tài khoản lưu trong D1. Khi đăng nhập lần đầu, dữ liệu Khách trên thiết bị được chuyển vào tài khoản mới nếu tài khoản chưa có dữ liệu.

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
pnpm test
pnpm lint
pnpm build
```

Ứng dụng không cần Binance API key vì chỉ đọc dữ liệu thị trường công khai.

## Pine Script được hỗ trợ

Trình phân tích hỗ trợ biến, gán lại `:=`, phép tính và điều kiện `? :`, `input.int/float/bool`, `math.floor/round/max/min/pow/abs/sqrt`, `int/float`, `timeframe.in_seconds`, `ta.sma/ema/rsi/stdev`, tối đa 8 đường `plot` và các vùng `fill` giữa hai biến plot. Mỗi đường có tên, màu, độ trong suốt và độ dày. Bảng màu và tham số cập nhật mã tương ứng. Mã dán có định dạng Markdown `**`, khoảng trắng HTML hoặc phép nhân đã escape được làm sạch trước khi đọc. Lỗi chỉ rõ dòng nguồn.

Đây là tập con Pine Script, không phải toàn bộ môi trường Pine của TradingView. Không hỗ trợ vòng lặp, strategy, alert, đối tượng vẽ hay nguồn `request.security` tùy ý. Mã không được chạy bằng `eval` và không thể chạy JavaScript tùy ý. Tham số chưa hỗ trợ sẽ báo lỗi.

### BTC Cost Of Production

Chỉ báo có sẵn trong bảng Chỉ báo, bật mặc định cho các cặp BTC ghép USD hoặc stablecoin USD. Có nút bật/tắt, bánh răng chỉnh smoothed/raw, màu đường và vùng nền. Thiết lập được lưu cùng cấu hình của khách hoặc tài khoản. Chỉ báo hoạt động độc lập với chỉ báo Pine tự tạo và tự ẩn khi mở coin/cặp có đơn vị giá khác.

Mẫu `examples/pine/btc-cost-of-production.pine` giữ công thức của jv_indicators, `k=0.45`, `alpha=1/1800`, trợ cấp block theo halving 210.000 block, làm mượt 90 ngày theo khung biểu đồ, đường smoothed/raw và vùng ×1.20. Ghi công và MPL 2.0 được giữ trong nguồn. Có thể nạp mẫu từ trình soạn thảo hoặc dán mã gốc nhiều dòng.

Năm tên nguồn trong mã được ánh xạ rõ ràng sang dữ liệu công khai:

| Tên Pine | Nguồn thực của Chart Lab |
| --- | --- |
| GLASSNODE:BTC_DIFFICULTY | Blockchain.com `difficulty` hằng ngày |
| COINMETRICS:BTC_FEEUSD | Blockchain.com `transaction-fees-usd` hằng ngày |
| INDEX:BTCUSD | Blockchain.com `market-price` hằng ngày |
| GLASSNODE:BTC_BLOCKSMINED | Coin Metrics Community `BlkCnt` hằng ngày |
| GLASSNODE:BTC_BLOCKS | Tổng `BlkCnt` từ 03/01/2009; genesis có height 0 |

Đây là **nguồn thay thế**, không phải feed Glassnode/INDEX gốc của TradingView. Cách tổng hợp ngày và giá có thể khác nên không cam kết kết quả giống 100%. Dữ liệu on-chain được tải theo ngày UTC, chỉ đưa ngày đã hoàn tất vào biểu đồ (`gaps_off`, `lookahead_off`), lưu cache tối đa một giờ; không dùng giá trị dự đoán hay số block giả định. Nguồn thiếu hoặc lỗi sẽ hiển thị trạng thái và để trống chỉ báo. Lịch sử on-chain khoảng hai năm. Có phần khởi tạo 92 ngày trước các nến đang tải để tính SMA 90 ngày ở các khung 1m–1w; không tạo OHLC Binance giả cho thời gian trước đó. Chỉ báo này luôn tính cho BTC, có nhắc trên giao diện khi đang mở coin khác.

## Dữ liệu và lưu trữ

- Lịch sử tải tối đa 500 nến mỗi yêu cầu; ứng dụng giữ tối đa 3.000 nến trên biểu đồ.
- Spot REST: `data-api.binance.vision`.
- Futures USDⓈ-M REST: `fapi.binance.com` cùng các máy chủ dự phòng chính thức của Binance.
- Người dùng công khai: cấu hình nằm trong `localStorage`, không tự đồng bộ giữa trình duyệt hoặc thiết bị.
- Tài khoản Chart Lab: dữ liệu lưu trong Cloudflare D1 theo từng tài khoản. Mật khẩu được băm với PBKDF2 và muối riêng; phiên đăng nhập dùng cookie HttpOnly, SameSite=Lax. Tùy chọn ghi nhớ phiên trong 30 ngày; bỏ chọn dùng cookie phiên và hạn máy chủ 12 giờ. Không lưu mật khẩu plaintext vào trình duyệt. Trình quản lý mật khẩu của trình duyệt dùng autocomplete chuẩn.
- Danh tính ChatGPT đã được cấp quyền trước đây vẫn có thể dùng dữ liệu riêng trong D1.

Không commit file `.env`, khóa API hoặc token vào repository. Các mẫu bí mật đã được loại khỏi `.gitignore`.

## Xác minh email và khôi phục mật khẩu

Tài khoản mới có thể nhập email tùy chọn lúc đăng ký; tài khoản hiện có bấm tên tài khoản, nhập email và mật khẩu hiện tại để nhận thư xác minh. Email chỉ dùng khôi phục sau khi bấm xác minh. Link dùng fragment `#token=…` để tránh token vào query/log/referrer; trình duyệt xóa fragment khỏi thanh địa chỉ sau khi đọc. Không tiêu thụ token bằng GET để tránh trình quét thư bấm thay người dùng.

Token ngẫu nhiên 256 bit, lưu hash SHA-256, hết hạn sau 30 phút, chỉ dùng một lần. Đặt lại mật khẩu thu hồi các phiên đăng nhập. Có giới hạn theo IP và email, thông báo quên mật khẩu không tiết lộ tài khoản có tồn tại. Cần chạy migration mới `0003_mixed_thunderbird.sql`; không sửa các migration đã áp dụng.

### Cấu hình gửi thư thật

Thiết lập biến runtime trên Sites (không ghi bí mật vào GitHub):

- `RESEND_API_KEY` — secret API key của Resend, chỉ cần quyền gửi thư.
- `MAIL_FROM` — địa chỉ gửi thuộc domain đã xác minh với Resend, ví dụ `Chart Lab <accounts@your-domain.com>`.
- `APP_ORIGIN` — URL HTTPS của web, hiện là `https://binance-chart-lab.vuhoach-idc.chatgpt.site`.

Sau khi cấu hình, xuất bản lại để áp dụng. Nếu chưa cấu hình, đăng ký và đăng nhập vẫn dùng được; chức năng gửi thư bị vô hiệu hóa với thông báo rõ ràng. Không có chế độ giả vờ gửi email thành công.

`pnpm test` kiểm tra trình Pine và luồng tài khoản bằng SQLite thực với dịch vụ gửi thư được mô phỏng: đăng ký, ghi nhớ phiên, xác minh bằng mật khẩu, token có hash/hết hạn/dùng một lần, đổi mật khẩu và thu hồi phiên, CSRF/rate limit. Cần kiểm tra thư thực sau khi chủ web cấu hình Resend.

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
