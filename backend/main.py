import os
import numpy as np
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from data_loader import load_and_process_movies

# 1. 환경 설정
load_dotenv()
local_embedding_model = SentenceTransformer('jhgan/ko-sroberta-multitask')
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ★ [핵심] 폴더 경로 찾기 (수정됨)
# 현재 파일(main.py)의 위치: .../backend
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# data 폴더 위치: .../backend/data
DATA_PATH = os.path.join(BASE_DIR, "data")
# src 폴더 위치: .../backend의 상위폴더/src
SRC_DIR = os.path.join(os.path.dirname(BASE_DIR), "src")

print(f"📂 데이터 경로: {DATA_PATH}")
print(f"📂 SRC 경로: {SRC_DIR}")

# 전역 변수
movies_db = {}
MOVIE_TITLES = {
    "extreme_job": "극한직업",
    "DarkFigureofCrime": "암수살인",
    "parasite": "기생충",
    '1987' : '1987',
    'dogani': '도가니',
    'theking': '더킹',
}

# 2. 헬퍼 함수
def get_embedding(text):
    if not isinstance(text, str) or len(text.strip()) == 0: return []
    try: return local_embedding_model.encode(text).tolist()
    except Exception as e:
        print(f"❌ 임베딩 실패: {e}")
        return []

def calculate_similarity(embedding1, embedding2):
    if not embedding1 or not embedding2: return 0
    e1, e2 = np.array(embedding1), np.array(embedding2)
    norm1, norm2 = np.linalg.norm(e1), np.linalg.norm(e2)
    if norm1 == 0 or norm2 == 0: return 0
    return np.dot(e1, e2) / (norm1 * norm2)

# 3. Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 [System] 서버 시작... 데이터 로딩 중")
    global movies_db
    movies_db = load_and_process_movies(DATA_PATH)
    print(f"✨ [System] 준비 완료! 총 {len(movies_db)}개의 영화가 로드되었습니다.")
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ★ [수정됨] 정적 파일 연결
# data 폴더는 backend 안에 있으니 그대로
app.mount("/images", StaticFiles(directory=DATA_PATH), name="images")
# src 폴더는 아까 계산한 SRC_DIR 사용
app.mount("/src", StaticFiles(directory=SRC_DIR), name="src")


# 4. 로직 (생략 없이 기존과 동일)
def generate_reply(movie_id, character, user_message):
    movie_data = movies_db.get(movie_id)
    if not movie_data: return "영화 데이터를 찾을 수 없습니다."
    
    df = movie_data["df"]
    speaker_col = movie_data["speaker_col"]
    persona_map = movie_data.get("persona_map", {})

    user_embedding = get_embedding(user_message)
    df['similarity'] = df['embedding'].apply(lambda x: calculate_similarity(user_embedding, x))
    top_results = df.sort_values(by='similarity', ascending=False).head(5)
    
    context_text = ""
    for _, row in top_results.iterrows():
        spk = row[speaker_col] if speaker_col else "알수없음"
        line = row['utterance']
        context_text += f"- {spk}: {line}\n"
    
    if character in persona_map: system_instruction = persona_map[character]
    else: system_instruction = f"당신은 영화 속 등장인물 {character}입니다."

    movie_title_kr = MOVIE_TITLES.get(movie_id, movie_id)
    final_system_prompt = f"""
당신은 영화 <{movie_title_kr}>의 등장인물 '{character}'입니다.
아래의 [페르소나 지침]을 완벽하게 숙지하고 그에 따라 연기하세요.

[페르소나 지침]
{system_instruction}

[참고: 영화 대본 맥락]
{context_text}
"""
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": final_system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.8
        )
        return completion.choices[0].message.content
    except Exception as e:
        return f"오류: {e}"

# 5. 엔드포인트
class ChatRequest(BaseModel):
    movieId: str
    characterName: str
    userMessage: str

@app.post("/api/talk")
async def chat_endpoint(request: ChatRequest):
    reply = generate_reply(request.movieId, request.characterName, request.userMessage)
    return {"reply": reply}

# ★ [수정됨] HTML 페이지 경로 수정
@app.get("/talk")
async def talk_page():
    return FileResponse(os.path.join(SRC_DIR, "talk/talk.html"))

@app.get("/api/characters/{movie_id}")
def get_characters(movie_id: str):
    data = movies_db.get(movie_id)
    if not data: return {"characters": []}
    
    char_list = data.get("characters", [])
    character_info_list = []
    
    # ★ [핵심] 한글 이름 -> 영어 파일명 연결표
    # 파일 이름을 영어로 바꾸고 여기에 적어주면 됩니다.
    FILENAME_MAP = {
        "고반장": "goban.jpg",
        "장형사": "jang.jpg",
    }

    print(f"--- [{movie_id}] 이미지 찾기 시작 ---") 

    for name in char_list:
        image_url = "" 
        
        # 1. 연결표에 있는 영어 파일 먼저 찾기
        if name in FILENAME_MAP:
            eng_filename = FILENAME_MAP[name]
            # 경로: data/extreme_job/goban.jpg
            file_path = os.path.join(DATA_PATH, movie_id, eng_filename)
            
            print(f"  검사: {file_path}")
            
            if os.path.exists(file_path):
                image_url = f"/images/{movie_id}/{eng_filename}"
                print(f"  -> 성공! ({eng_filename})")
        
        # 2. 연결표에 없으면 원래대로 한글 파일 찾기 (혹시 모르니 유지)
        if image_url == "":
            base_path = os.path.join(DATA_PATH, movie_id, name)
            if os.path.exists(f"{base_path}.jpg"): image_url = f"/images/{movie_id}/{name}.jpg"
            elif os.path.exists(f"{base_path}.png"): image_url = f"/images/{movie_id}/{name}.png"
            elif os.path.exists(f"{base_path}.jpeg"): image_url = f"/images/{movie_id}/{name}.jpeg"

        character_info_list.append({"name": name, "image": image_url})

    return {"characters": character_info_list}

@app.get("/characters/{movie_id}")
def get_characters_legacy(movie_id: str):
    return get_characters(movie_id)

print("\n========== [파일 확인] ==========")
target_folder = "data/extreme_job"
if os.path.exists(target_folder):
    files = os.listdir(target_folder)
    print(f"📂 '{target_folder}' 폴더 안에 있는 파일들:")
    print(files)
else:
    print(f"❌ 폴더가 없습니다: {target_folder}")
print("=================================\n")