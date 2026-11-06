import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// PREVIEW=1 이면 미리보기용 단일 HTML 파일로 빌드합니다.
export default defineConfig({
  base: './',   // GitHub Pages(/roborobo-lms/) 등 어떤 경로에 올려도 동작
  plugins: process.env.PREVIEW ? [react(), viteSingleFile()] : [react()],
})
