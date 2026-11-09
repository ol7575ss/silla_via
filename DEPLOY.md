# Cloudflare Pages 배포

1. Pages에서 GitHub 저장소 `ol7575ss/silla_via`를 연결합니다. Production branch는 `main`, 루트는 저장소 최상위로 설정합니다.
2. 빌드 명령은 `npm run build`, 출력 디렉터리는 `dist`입니다. Vite 8을 지원하는 Node.js 22.12 이상을 사용하세요. 빌드 이미지의 Node 버전이 낮을 때만 일반 빌드 변수 `NODE_VERSION`을 설정합니다.
3. Production 환경의 Secret으로 `KMA_API_KEY`, `BUS_API_KEY`, `TOUR_API_KEY`, `KAKAO_REST_API_KEY`를 등록합니다. Preview에서도 LIVE를 사용할 경우 해당 환경에 별도로 등록하세요. 런타임 일반 변수와 추가 바인딩은 필요하지 않습니다.
4. Git 연동 배포가 저장소 루트의 `functions/api/`를 함께 배포합니다. Vite는 `public/_routes.json`을 출력 디렉터리에 복사합니다. 정적 파일과 PWA 파일은 Pages에서 제공하고 `/api/*` 요청은 Functions로 전달합니다.
5. 배포 후 HTTPS 기본 경로에서 새로고침과 PWA 설치를 확인하세요. LIVE에서 정류소명을 검색하고 정류소 ID, 경유 노선, 노선 상세, 도착예정시간을 차례로 확인합니다. 경주 지원 여부는 TAGO의 각 서비스가 반환한 도시 목록으로 판정합니다. 도착정보는 운행 시간대에 따라 비어 있을 수 있습니다.
6. 오류가 발생하면 개발자 도구 Network에서 `/api/*`의 상태 코드와 응답의 `error`를 확인합니다. `apiKey`는 대상 배포 환경의 Secret, `apiAuth`는 인증키와 해당 서비스 승인 여부, 429는 호출 한도, `apiFailed`는 공급자 응답 또는 통신 상태를 확인하세요. 빌드 실패는 배포 빌드 로그에서, Functions 실행 오류는 해당 배포의 Functions 로그에서 확인합니다. Secret 변경 후 새 배포에 적용하세요.

로컬에서 Functions까지 사용하려면 저장소 루트의 `.dev.vars`에 네 Secret을 설정하고 `npm run dev:pages`를 실행합니다. 파일을 처음 만들 때는 `.dev.vars.example`을 복사하세요.

TAGO 공식 명세는 [버스정류소정보](https://www.data.go.kr/data/15098534/openapi.do), [버스노선정보](https://www.data.go.kr/data/15098529/openapi.do), [버스도착정보](https://www.data.go.kr/data/15098530/openapi.do)에서 확인할 수 있습니다.
