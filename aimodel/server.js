import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// Serve static files from the 'frontend' directory at the root level
app.use(express.static(path.join(__dirname, "../frontend")));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

app.post("/api/chat", async (req, res) => {
    try {
        const { message, context } = req.body;
        if (!message) return res.status(400).json({ reply: "Empty message" });

        const contents = [
            { text: "You are a helpful assistant. Use Markdown for structure." }
        ];

        if (Array.isArray(context)) {
            context.forEach(item => {
                if (item.startsWith("Image File:")) {
                    const base64Match = item.match(/Base64 Data: (data:image\/[^;]+;base64,[^"]+)/);
                    if (base64Match) {
                        const base64Data = base64Match[1];
                        contents.push({
                            inlineData: {
                                mimeType: base64Data.split(';')[0].split(':')[1],
                                data: base64Data.split(',')[1]
                            }
                        });
                    }
                } else {
                    contents.push({ text: item });
                }
            });
        }

        contents.push({ text: `User: ${message}` });
        const result = await model.generateContent(contents);
        res.json({ reply: (await result.response).text() });
    } catch (err) {
        console.error("🔥 GEMINI ERROR:", err);
        res.status(500).json({ reply: "Server Error" });
    }
});

// For Vercel, we export the app instead of calling app.listen()
export default app;