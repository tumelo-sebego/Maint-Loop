// server.js
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Agent } from '@mariozechner/pi-agent-core';
import { streamSimple } from '@mariozechner/pi-ai';

// Clean imports from our new modular file
import { piToolsList, coreSystemInstruction } from './tools.js';

dotenv.config();
const app = express();
app.use(express.json());

// ==========================================
// OLLAMA CLOUD MODEL REFERENCE BLOCK
// ==========================================
const ollamaCloudModel = {
  id: process.env.OLLAMA_MODEL || 'gemma4:27b',
  name: 'Ollama Cloud Model',
  api: 'openai-completions',
  provider: 'ollama-cloud',
  baseUrl: 'https://ollama.com/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 8192,
};

// ==========================================
// AGENT ORCHESTRATOR RUNTIME RUNNER
// ==========================================
async function runAgentOrchestrator(userInstruction) {
  console.log(`[Engine Activation]: Initializing Pi Agent loop for prompt: "${userInstruction}"`);

  try {
    const agent = new Agent({
      initialState: {
        model: ollamaCloudModel,
        systemPrompt: coreSystemInstruction, // Bound from module
        tools: piToolsList,                  // Bound from module
        messages: [],
      }
    });

    // The interceptor override fix that resolved the authentication layer
    agent.streamFn = (model, context, options) => {
      return streamSimple(model, context, {
        ...options,
        apiKey: process.env.OLLAMA_API_KEY,
        headers: {
          'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}`
        }
      });
    };

    // Keep active operational terminal streaming active
    agent.subscribe(async (event) => {
      // Ignore noisy token-by-token update strings to keep server output legible
      if (event.type === 'message_update') return;

      console.log(`📡 [Pi Raw Event Stream]: Received type -> "${event.type}"`);
      
      if (event.type === 'tool_execution_start') {
        console.log(`🔧 [Pi Tool Action]: Executing -> ${event.toolName}`);
      }
      if (event.type === 'message_end') {
        console.log(`📝 [Pi Turn Content]:`, event.message?.content);
      }
    });

    console.log(`[Engine Activation]: Routing payload pipeline to cloud provider...`);
    await agent.prompt(userInstruction);
    console.log(`[Engine Success]: Pi Agent concluded execution cycle.`);

  } catch (error) {
    console.error('❌ CRITICAL: Pi Agent Core Error Stack:', error.stack);
  }
}

// ==========================================
// UNIVERSAL API ENDPOINT
// ==========================================
app.post('/run-instruction', (req, res) => {
  const instruction = req.body.instruction;
  res.status(200).json({ status: 'accepted', message: 'Pi Agent processing started.' });
  runAgentOrchestrator(instruction);
});

// Database Connectivity Initialization Hook
mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(3000, () => console.log('Server running on port 3000')))
  .catch(err => console.error(err));