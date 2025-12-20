// Node.js의 기본 웹 서버 모듈인 express를 가져옵니다.
import express from 'express';
// 파일 및 디렉토리 경로를 쉽게 다루기 위한 path 모듈을 가져옵니다.
import path from 'path';
// ES Module 환경에서 __dirname, __filename을 사용하기 위한 모듈을 가져옵니다.
import { fileURLToPath } from 'url';
// node-fetch 모듈을 import 합니다.
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';

// [ 2. .env 파일 로드 ]
dotenv.config();

const app = express();
const port = 3000;

// 현재 파일의 경로를 계산합니다.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use(express.static('public'));


// --- 라우팅(경로) 설정 ---

// 1. HTML 페이지 라우팅
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'home', 'home.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'login', 'login.html'));
});

app.get('/mypage', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'mypage', 'mypage.html'));
});

app.get('/talk', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'talk', 'talk.html'));
});


// ------------------------------------------------------------------
// ▼▼▼ 2. API 라우팅 (KMDb 프록시)
// ------------------------------------------------------------------
app.get('/api/search', async (req, res) => {
    
    const KMDB_API_KEY = process.env.KMDB_API_KEY; 
    
    if (!KMDB_API_KEY) {
        console.error("KMDb API 키가 .env 파일에 설정되지 않았거나 로드에 실패했습니다!");
        return res.status(500).json({ message: '서버에 API 키가 설정되지 않았습니다.' });
    }

    // [URL 파라미터 동적 구성]
    //  KMDb API 기본 URL을 새 주소(JSON 요청)로 변경
    const baseUrl = `https://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp`;

    //  KMDb API 필수 파라미터 설정 (collection, detail 수정)
    const searchParams = new URLSearchParams({
        ServiceKey: KMDB_API_KEY,
        collection: 'kmdb_new2', // 예시에 맞춰 'kmdb_new2'로 변경
        detail: 'Y',             // 예시에 맞춰 'N'으로 변경
        listCount: '20'
    });

    //  home.js에서 보낸 *모든* 쿼리 파라미터를 searchParams에 추가
    // (예: genre='스릴러', sort='prodYear,1', title='인기' 등)
    for (const [key, value] of Object.entries(req.query)) {
        // detail=Y를 home.js에서 보내도 'N'으로 유지되도록 함 (선택적)
        if (key !== 'detail' && key !== 'collection' && key !== 'ServiceKey') {
            searchParams.append(key, value);
        }
    }
    
    // (4) 완성된 API URL
    const apiUrl = `${baseUrl}?${searchParams.toString()}`;
    console.log(`[서버] KMDb API 요청 URL: ${apiUrl}`); // 디버깅용 로그

    try {
        const apiResponse = await fetch(apiUrl);
        
        if (!apiResponse.ok) {
            console.error(`KMDb API Error: ${apiResponse.status} ${apiResponse.statusText}`);
            throw new Error(`KMDb API Error: ${apiResponse.statusText}`);
        }

        const textData = await apiResponse.text();

        // [ 5. KMDb 응답 파싱 ]
        // (이제 search_json2.jsp를 호출하므로 JSON 파싱이 정상 동작해야 함)
        try {
            const jsonData = JSON.parse(textData);
            
            // 새 API의 응답 구조가 다를 수 있습니다.
            // 기존: jsonData.Data[0].Result
            // 새 API: jsonData.Data[0].Result (동일할 수도 있음)
            if (jsonData && jsonData.Data && jsonData.Data.length > 0 && jsonData.Data[0].Result) {
                res.json(jsonData.Data[0].Result); // 성공
            } else {
                console.log('KMDb API 결과가 있지만 Result 데이터가 없음 (검색 결과 없음)');
                res.json([]); // 빈 배열
            }
        } catch (jsonError) {
            console.error("KMDb 응답 파싱 실패:", jsonError);
            console.error("KML API 응답 원본:", textData);
            res.status(500).json({ message: 'KMDb API 응답 형식을 파싱할 수 없습니다.'});
        }

    } catch (error) {
        console.error('KMDb API 요청 중 네트워크 오류 또는 fetch 실패:', error);
        res.status(500).json({ message: '서버에서 API 요청 중 오류가 발생했습니다.' });
    }
});



app.post('/api/talk', async (req, res) => {
    // 프론트엔드에서 보낸 데이터 받기
    const { movieId, characterName, userMessage } = req.body;

    console.log(`[Node.js] 챗봇 요청 받음: ${characterName}에게 "${userMessage}"`);

    // Python FastAPI 서버 주소 (기본 포트 8000)
    const PYTHON_API_URL = 'http://127.0.0.1:8000/chat';

    try {
        // 1. Python 서버로 요청 전달 (Fetch 사용)
        const response = await fetch(PYTHON_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Python의 Pydantic 모델(ChatRequest) 필드명과 일치시켜야 함
            body: JSON.stringify({
                movie_id: movieId,      // 예: 'extreme_job'
                character: characterName, // 예: '고반장'
                message: userMessage
            }),
        });

        // 2. Python 서버 응답 처리
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Python Server Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json(); // { reply: "..." }

        // 3. 프론트엔드로 결과 반환
        res.json(data);

    } catch (error) {
        console.error('[Node.js] AI 서버 통신 실패:', error);
        res.status(500).json({ 
            message: 'AI 캐릭터와 연결할 수 없습니다.', 
            error: error.message 
        });
    }
});

app.get('/api/characters/:movieId', async (req, res) => {
    const { movieId } = req.params;
    try {
        // Python 서버로 요청
        const response = await fetch(`http://127.0.0.1:8000/characters/${movieId}`);
        
        if (!response.ok) {
            return res.json({ characters: [] }); // 에러 시 빈 배열 반환
        }

        const data = await response.json();
        res.json(data); // { characters: ['고반장', '장형사', ...] }

    } catch (error) {
        console.error("캐릭터 목록 조회 실패:", error);
        res.status(500).json({ error: "캐릭터 목록을 불러올 수 없습니다." });
    }
});



// ------------------------------------------------------------------
// ▲▲▲ 2. API 라우팅 (KMDb 프록시) 
// ------------------------------------------------------------------


// 3. 폼 처리 라우팅 (POST)
app.post('/login_process', (req, res) => {
    const { username, password } = req.body;
    console.log('클라이언트가 보낸 로그인 정보:', username, password);
    
    if (username === 'user' && password === '1234') {
        res.json({ success: true, message: '로그인 성공!' });
    } else {
        res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }
});


// --- 서버 실행 ---
app.listen(port, () => {
    console.log(`Movie AI 서버가 http://127.0.0.1:${port} 에서 실행 중입니다.`);
    console.log('--- 등록된 라우트 ---');
    console.log('GET /');
    console.log('GET /login');
    console.log('GET /mypage');
    console.log('GET /talk');
    console.log('GET /api/search (KMDb v2 JSON API로 수정됨)');
    console.log('POST /login_process');
    console.log('---------------------');
});

