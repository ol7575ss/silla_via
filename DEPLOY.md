# Cloudflare Pages 배포

1. Pages에서 GitHub 저장소 `ol7575ss/silla_via`를 연결합니다. Production branch는 `main`, 루트는 저장소 최상위로 설정합니다.
2. 빌드 명령은 `npm run build`, 출력 디렉터리는 `dist`입니다. Vite 8을 지원하는 Node.js 22.12 이상을 사용하세요. 빌드 이미지의 Node 버전이 낮을 때만 일반 빌드 변수 `NODE_VERSION`을 설정합니다.
3. Production 환경의 Secret으로 `KMA_API_KEY`, `BUS_API_KEY`, `TOUR_API_KEY`, `KAKAO_REST_API_KEY`를 등록합니다. Preview에서도 LIVE를 사용할 경우 해당 환경에 별도로 등록하세요. 런타임 일반 변수와 추가 바인딩은 필요하지 않습니다.
4. Git 연동 배포가 저장소 루트의 `functions/api/`를 함께 배포합니다. Vite는 `public/_routes.json`을 출력 디렉터리에 복사합니다. 정적 파일과 PWA 파일은 Pages에서 제공하고 `/api/*` 요청은 Functions로 전달합니다.
5. HTTPS 기본 경로, PWA 설치, 여행 날짜 선택 후 아래 API 응답을 확인하세요. 개발 진단 화면은 Vite 개발 모드에서만 표시됩니다.
6. 오류가 발생하면 개발자 도구 Network에서 `/api/*`의 상태 코드와 응답의 `error`를 확인합니다. `apiKey`는 대상 배포 환경의 Secret, `apiAuth`는 인증키와 해당 서비스 승인 여부, 429는 호출 한도, `apiFailed`는 공급자 응답 또는 통신 상태를 확인하세요. 빌드 실패는 배포 빌드 로그에서, Functions 실행 오류는 해당 배포의 Functions 로그에서 확인합니다. Secret 변경 후 새 배포에 적용하세요.

로컬에서 Functions까지 사용하려면 저장소 루트의 `.dev.vars`에 네 Secret을 설정하고 `npm run dev:pages`를 실행합니다. 파일을 처음 만들 때는 `.dev.vars.example`을 복사하세요.

## 운영 배포 확인

아래 상대 경로를 **같은 Production 배포 주소**에서 엽니다. 키를 URL에 추가할 필요가 없습니다. 요청마다 공급자 사용량이 발생할 수 있습니다.

| 기능 | 요청 예 | 정상 응답의 확인 항목 |
| --- | --- | --- |
| 관광지·문화시설 | `/api/tour?kind=attractions&page=1`, `/api/tour?kind=culture&page=1` | `items`, `more`, `fetchedAt`; 항목의 이름·주소·콘텐츠 ID |
| 음식점·숙박 | `/api/tour?kind=dining&q=카페`, `/api/tour?kind=lodging&page=1` | 원문 이름 및 해당 콘텐츠 유형. 다음 페이지가 있으면 계속 탐색 |
| 축제 | `/api/tour?kind=festivals&page=1` | 행사 시작·종료일. 화면은 두 날짜 사이에 여행일이 포함된 행사만 표시 |
| 관광지 상세 | `/api/tour?kind=attractions&id={목록의 콘텐츠ID}` | 소개. 같은 요청에 `&intro=1`을 추가하면 운영 안내와 휴무 원문 |
| 기상청 단기예보 | `/api/weather` | KST 기준 `baseDate`, `baseTime`, 시간별 `hours` |
| 실황·초단기예보 | `/api/weather?kind=observed`, `/api/weather?kind=near` | 각각 `kind`, 발표일·시각, `samples`의 강수형태·기온·강수량 |
| 경주시 정류장 | `/api/bus?action=stops&q=경주역` | XML 원문의 정류소명·ID. 정상 결과가 없으면 `items: []` |
| 경주시 노선·위치 | `/api/bus?action=routes&q={노선번호}`, `/api/bus?action=positions&q={반환된 노선ID}` | 시종점, 위치 조회의 정류소·순서·원시 좌표. 도착예정시간은 제공하지 않음 |
| 카카오 도보·대중교통 | `/api/routing?from=cheomseongdae&to=daereungwon&mode=WALK` | `ok`, `meters`, `seconds`, `steps`. 대중교통은 `PUBLIC_TRANSIT` |

HTTP 200인데 JSON 대신 HTML이 오면 해당 배포에 Functions가 포함되었는지, `dist/_routes.json`이 있는지 확인합니다. JSON 오류면 같은 시각의 Functions 로그에서 서비스·기능·공급자 HTTP 상태·결과 코드·파싱 실패 여부·건수를 대조합니다. 키, 요청 헤더, 원본 응답은 공유하지 마세요. 브라우저 개발자 도구에서 캐시를 끈 뒤 Production의 새 배포에서 재확인할 수 있습니다.

경주시 버스 상세기능의 승인 한도는 각각 일 100회입니다. 동일한 성공 요청은 정류장·노선 24시간, 위치 2분 동안 엣지에서 캐시합니다. 엣지 캐시는 전 세계 합산 호출 제한을 보장하지 않습니다. 좌표 기준이 공급자 설명과 필드명만으로 확정되지 않아 위치를 지도에 투영하지 않습니다.

카카오 Developers에서 앱의 카카오맵 활성화 여부와 REST 키 사용 설정을 확인하세요. 첫 활성화 앱의 무료 쿼터 및 추가 앱·초과 사용에 대한 비즈월렛/유료 API 설정은 [카카오맵 이용 정책](https://developers.kakao.com/docs/ko/kakaomap/common)을 따릅니다. 경로는 공식 링크로 엽니다.

공식 명세는 [경주시 버스](https://www.data.go.kr/data/15158687/openapi.do), [TourAPI](https://www.data.go.kr/data/15101578/openapi.do), [기상청 단기예보](https://www.data.go.kr/data/15084084/openapi.do), [카카오 경로](https://developers.kakao.com/docs/ko/kakaomap/rest-api)에서 확인할 수 있습니다.
