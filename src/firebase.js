import { ENV } from './config.js';

// Firebase App 모듈 가져오기
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";

// Firebase Authentication 관련 모듈들 가져오기
import {
    getAuth, // Authentication 서비스 가져오기
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut // 1. signOut 함수를 import 합니다.
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

// Firestore 관련 모듈들 가져오기
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// (중요) Firebase 프로젝트 설정 값
const firebaseConfig = {
    apiKey: ENV.FIREBASE_API_KEY,
    authDomain: ENV.FIREBASE_AUTH_DOMAIN,
    projectId: ENV.FIREBASE_PROJECT_ID,
    storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
    appId: ENV.FIREBASE_APP_ID,
    measurementId: ENV.FIREBASE_MEASUREMENT_ID
};

// --- Firebase 서비스 초기화 ---
console.log("1. initializeApp 호출 전");
const app = initializeApp(firebaseConfig);
console.log("2. Firebase App 초기화 완료:", app);

// 2. Auth와 DB를 export 해서 다른 파일(script(main).js)에서 쓸 수 있게 합니다.
export const auth = getAuth(app);
console.log("3. Firebase Auth 초기화 완료:", auth);

const db = getFirestore(app);
console.log("5. Firestore DB 초기화 완료:", db);
console.log("6. 모든 Firebase 서비스 초기화 완료.");
// ------------------------------------


// --- Firestore 함수들 ---

/**
 * 회원가입 성공 시, 사용자 정보를 Firestore 'users' 컬렉션에 저장합니다.
 * @param {object} user - Firebase Auth의 user 객체
 * @param {string} nickname - 사용자가 입력한 닉네임
 */
export const saveUserToFirestore = async (user, nickname) => {
    console.log("Firestore 저장 함수로 전달된 닉네임:", nickname);
    
    // 'users' 컬렉션에 user.uid를 문서 ID로 사용하여 데이터 저장
    const userRef = doc(db, "users", user.uid);
    if (nickname === undefined) {
            console.error("saveUserToFirestore 함수가 nickname으로 undefined 값을 받았습니다!");
            throw new Error("닉네임 값이 전달되지 않았습니다.");
        }

        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            nickname: nickname, // 함수로 전달받은 닉네임
            createdAt: new Date(),
        });
}

/**
 * Firestore의 'users' 컬렉션에서 사용자 프로필 정보(닉네임 포함)를 가져옵니다.
 * @param {string} uid - 사용자의 UID
 * @returns {object | null} - 사용자 프로필 객체 (문서가 있으면) 또는 null (문서가 없으면)
 */
export const getUserProfile = async (uid) => {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        console.log("1. Firestore에서 프로필 문서를 찾았습니다:", docSnap.data());
        return docSnap.data(); // 문서 데이터를 반환
    } else {
        console.log("2. Firestore에 해당 UID의 문서가 없습니다.");
        return null; // 문서가 존재하지 않음
    }
}


// --- Authentication 함수들 ---

// Email 회원가입 함수
export const signupEmail = (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
}

// Email 로그인 함수
export const loginEmail = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
}

// 3. signOut 함수도 export 합니다. (script(main).js에서 사용)
export { signOut };
