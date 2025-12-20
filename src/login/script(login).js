// 1. firebase.js에서 getUserProfile 함수를 추가로 import 합니다.
import { loginEmail, signupEmail, saveUserToFirestore, getUserProfile } from '../firebase.js';

//HTML 요소들을 ID를 통해 가져옴
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('pw');
const nicknameInput = document.getElementById('nickname');
const buttons = document.getElementById('buttons');

// (추가됨) UI 변경에 필요한 요소들
const heading = document.getElementById('heading');
const nicknameField = document.getElementById('nickname-field');
const signinBtn = document.getElementById('signin');
const signupToggleBtn = document.getElementById('signup-toggle');
const signupBtn = document.getElementById('signup');


// (★★수정됨★★) buttons.addEventListener 함수 전체를 교체합니다.
buttons.addEventListener('click', async (e) => {
    e.preventDefault(); // 폼 기본 제출 동작 방지

    const email = emailInput.value;
    const password = passwordInput.value;

    // --- 1. 로그인 버튼 클릭 ---
    if (e.target.id === 'signin') {
        try {
            const result = await loginEmail(email, password);
            const user = result.user;

            loginSuccess(user.email, user.uid);

        } catch (error) {
            console.error("Login Error:", error);
            alert('이메일 또는 비밀번호가 일치하지 않습니다.');
        }
    
    // --- 2. '회원가입' 버튼 클릭 (UI 변경) ---
    } else if (e.target.id === 'signup-toggle') { 
        // (★★핵심★★) 이 부분이 새로 추가되었습니다.
        heading.textContent = 'Sign Up'; // 제목 변경
        nicknameField.style.display = 'block'; // 닉네임 필드 보이기
        signinBtn.style.display = 'none'; // 로그인 버튼 숨기기
        signupToggleBtn.style.display = 'none'; // '회원가입' 버튼 숨기기
        signupBtn.style.display = 'block'; // '가입 완료' 버튼 보이기

    // --- 3. '가입 완료' 버튼 클릭 (실제 회원가입 로직) ---
    } else if (e.target.id === 'signup') {
        const nicknameValue = nicknameInput.value;

        if (!nicknameValue) {
            alert('닉네임을 입력해주세요.');
            return;
        }

        try {
            const userCredential = await signupEmail(email, password);
            const user = userCredential.user;
            await saveUserToFirestore(user, nicknameValue); 
            
            alert('회원가입에 성공했습니다! 로그인 해주세요.');
            
            // 회원가입 성공 후 로그인 폼으로 다시 전환
            heading.textContent = 'Login';
            nicknameField.style.display = 'none';
            signinBtn.style.display = 'block';
            signupToggleBtn.style.display = 'block';
            signupBtn.style.display = 'none';
            // 입력 필드 초기화
            emailInput.value = '';
            passwordInput.value = '';
            nicknameInput.value = '';

        } catch (error) {
            console.error("Signup or Firestore Error:", error);
            if (error.code === 'auth/email-already-in-use') {
                alert('이미 사용 중인 이메일입니다.');
            } else if (error.code === 'auth/weak-password'){
                alert('비밀번호는 6자리 이상이어야 합니다.');
            } else {
                alert('회원가입에 실패했습니다: ' + error.message);
            }
        }
    }
});


// 로그인 성공 시 세션에 정보 저장 후 홈으로 이동
const loginSuccess = (email, uid) => {
    // sessionStorage에 저장할 필요가 없습니다.
    // home.js가 알아서 처리해줍니다.

    // 알림을 띄우고 바로 이동합니다.
    alert('로그인되었습니다. 홈으로 이동합니다.');
    window.location.href = '/'; // 홈 화면으로 이동
};