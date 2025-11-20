import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const testGemini = async () => {
  try {
    console.log('Testing Gemini API...');
    console.log('API Key (first 10 chars):', process.env.GEMINI_API_KEY?.substring(0, 10) + '...');
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = "Say hello in one word";
    
    console.log('Sending test request...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ Success! Gemini API is working!');
    console.log('Response:', text);
  } catch (error) {
    console.error('❌ Error testing Gemini API:');
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    if (error.message?.includes('API key')) {
      console.error('\n🔑 API Key Issues:');
      console.error('1. Make sure the API key is correct');
      console.error('2. Enable Gemini API in Google Cloud Console');
      console.error('3. Check if billing is enabled');
      console.error('4. Verify API key restrictions (IP, referrer)');
    }
  }
};

testGemini();
