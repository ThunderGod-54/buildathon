import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/* 🔑 Your API Key */
const GEMINI_API_KEY = "api-key-here"; // Replace with your actual API key

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/* ✅ GEMINI 2.5 FLASH is the best stable free-tier model right now */
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
});

app.post("/chat", async (req, res) => {
    try {
        const { message, context } = req.body;

        if (!message) {
            return res.status(400).json({ reply: "Empty message" });
        }

        // System prompt and context handling
        const prompt = `
You are a helpful assistant.
Context: ${Array.isArray(context) ? context.join("\n\n") : "None"}
User: ${message}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const reply = response.text();

        res.json({ reply });
    } catch (err) {
        // Detailed logging for development
        console.error("🔥 GEMINI ERROR:", err);

        if (err.status === 429) {
            return res.status(429).json({ reply: "Rate limit reached. Please wait a minute." });
        }

        res.status(500).json({
            reply: "Gemini API error. Please check your console."
        });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running → http://localhost:${PORT}`);
});