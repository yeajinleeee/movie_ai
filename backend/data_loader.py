import os
import pandas as pd
import ast
import numpy as np
from sentence_transformers import SentenceTransformer

# 1. 무료 로컬 임베딩 모델 로드 (한국어 성능 우수: jhgan/ko-sroberta-multitask)
print("📥 [Loader] 임베딩 모델 로딩 중... (최초 실행 시 다운로드)")
embedding_model = SentenceTransformer('jhgan/ko-sroberta-multitask')

def get_embedding(text):
    if not isinstance(text, str) or len(text.strip()) == 0:
        return []
    try:
        return embedding_model.encode(text).tolist() #실제 변환 작업, 결과 파이썬으로 바꾸는 거(tolist())
    except Exception as e:
        print(f"❌ 임베딩 실패: {e}")
        return []

def safe_eval_embedding(val):
    if pd.isna(val): return []
    if isinstance(val, list): return val
    if not isinstance(val, str): return []
    try:
        return ast.literal_eval(val)
    except (ValueError, SyntaxError):
        return []

def load_and_process_movies(base_path):
    """
    지정된 폴더에서 영화 데이터를 로드하고 처리하여 딕셔너리로 반환
    """
    movies_db = {} 

    if not os.path.exists(base_path):
        print(f"⚠️ '{base_path}' 폴더가 없습니다.")
        return movies_db

    movie_folders = [f for f in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, f))]
    print(f"📂 감지된 영화 목록: {movie_folders}")

    for movie_id in movie_folders:
        try:
            folder_path = os.path.join(base_path, movie_id)
            #파일 경로 설정
            excel_path = os.path.join(folder_path, "script.xlsx")
            pickle_path = os.path.join(folder_path, "script.pkl")
            persona_path = os.path.join(folder_path, "persona.xlsx")

            df = None

            # 1. 고속 파일(.pkl) 확인 및 로드 시도
            if os.path.exists(pickle_path):
                try:
                    print(f"🚀 [{movie_id}] 고속 데이터(.pkl) 로드 시도...")
                    df = pd.read_pickle(pickle_path)
                    
                    # 로컬 모델과 저장된 임베딩의 차원(길이) 확인 (호환성 체크)
                    sample_emb = df[df['embedding'].apply(len) > 0]['embedding'].iloc[0]
                    if len(sample_emb) != 768: # sroberta 모델은 768차원
                        print(f"⚠️ [{movie_id}] 임베딩 모델이 변경되었습니다. 재생성합니다.")
                        df = None
                        os.remove(pickle_path)
                except Exception as e:
                    print(f"⚠️ [{movie_id}] .pkl 파일 손상됨. ({e}) -> 삭제 후 재생성")
                    if os.path.exists(pickle_path): os.remove(pickle_path)
                    df = None


            # 2. 엑셀 로드 (pkl이 없거나 삭제된 경우)
            if df is None and os.path.exists(excel_path):
                print(f"🐢 [{movie_id}] 엑셀 파일 로드 중... (내 컴퓨터에서 임베딩 생성)")
                df = pd.read_excel(excel_path)
                
                if 'utterance' not in df.columns:
                    print(f"⚠️ [{movie_id}] 'utterance' 컬럼이 없어 스킵")
                    continue

                if 'embedding' not in df.columns:
                    df['embedding'] = [[] for _ in range(len(df))]
                else:
                    df['embedding'] = df['embedding'].apply(safe_eval_embedding) #문자열로 된 리스트 복구

                # 누락된 임베딩 채우기
                missing_mask = df['embedding'].apply(lambda x: len(x) == 0)
                if missing_mask.sum() > 0:
                    print(f"   ⚙️ [{movie_id}] {missing_mask.sum()}건 임베딩 생성 중 (무료)...")
                    # 로컬 함수 호출(임베딩 비어있는 행만 골라서 임베딩)
                    df.loc[missing_mask, 'embedding'] = df.loc[missing_mask, 'utterance'].apply(get_embedding)
                
                print(f"   💾 [{movie_id}] 고속 파일(.pkl) 저장 완료!")
                df.to_pickle(pickle_path) 
            
            elif df is None:
                print(f"⚠️ [{movie_id}] 대본 파일(xlsx, pkl)이 모두 없습니다.")
                continue
            
            #3. 페르소나 데이터 로직
            persona_map = {} # { "고반장": "프롬프트 내용...", "장형사": "..." }
            if os.path.exists(persona_path):
                try:
                    p_df = pd.read_excel(persona_path)
                    # 엑셀의 'speaker'와 'persona_prompt' 컬럼을 읽어서 딕셔너리로 저장
                    for _, row in p_df.iterrows():
                        speaker = str(row['speaker']).strip()
                        prompt = str(row['persona_prompt'])
                        persona_map[speaker] = prompt
                    print(f"    [{movie_id}] 페르소나 파일 로드 완료 ({len(persona_map)}명)")
                except Exception as e:
                    print(f"    [{movie_id}] 페르소나 로드 실패: {e}")
            else:
                print(f"    [{movie_id}] 페르소나 파일 없음. (기본 설정 사용)")
                

            # 4. DB 등록
            if df is not None:
                speaker_col = 'speaker' if 'speaker' in df.columns else None
                char_list = []
                if speaker_col:
                    char_list = df[speaker_col].value_counts().head(2).index.tolist()

                movies_db[movie_id] = {
                    "df": df,
                    "speaker_col": speaker_col,
                    "characters": char_list,  #대사량이 가장 많은 상위 2명의 이름을 추출
                    "persona_map": persona_map,
                }
                print(f"✅ [{movie_id}] 로드 완료 (주요 등장인물: {char_list})")

        except Exception as e:
            print(f" [{movie_id}] 처리 중 오류: {e}")
    
    return movies_db

# 단독 실행 테스트용 코드
if __name__ == "__main__":
    print("🔧 [데이터 로더] 단독 실행 모드")
    db = load_and_process_movies("./data")
    print(f"🎉 총 {len(db)}개 영화 처리 완료.")