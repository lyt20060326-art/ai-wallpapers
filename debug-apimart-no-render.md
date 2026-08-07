[OPEN] APIMart response reaches backend but frontend does not render.

## Session
- session_id: apimart-no-render
- date: 2026-07-22

## Symptom
- APIMart request is billed successfully.
- Frontend chat UI does not display assistant answer.
- Browser inspection shows:
  - `/api/chat` returns `200 OK` but `content-type: application/json`, not `text/event-stream`.
  - Response body is: `{"content":"😔 服务暂时不可用: fetch failed\n\n请检查 Clash Verge 是否运行在端口7897或网络连接"}`.
  - This means backend entered `catch` branch instead of streaming branch.

## Hypotheses
1. Undici's ProxyAgent is interfering even with proxy disabled, causing `fetch failed`.
2. APIMart request is only successful sometimes (user reported billing), but during this debug round it fails.
3. Global dispatcher set by `setGlobalDispatcher` is causing Node.js fetch to hang or fail.

## Plan
1. Disable any proxy/undici setup to ensure straight fetch to APIMart.
2. Add comprehensive logging in `POST` function to confirm where it fails.
3. Verify environment variables and endpoint are correct.
4. Once fixed, re-enable proxy safely if needed.

## Evidence
### Browser Check (2026-07-22)
- Endpoint hit: `POST http://localhost:3001/api/chat`
- Response header: `content-type: application/json` (not `text/event-stream` → caught by catch block)
- Response body: Error JSON instead of SSE → confirms backend fetch failed.
