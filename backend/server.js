import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());

// Dynamic schema that can accept any shape of object data saved by the agent
const DataLogSchema = new mongoose.Schema({
  collectionName: String,
  payload: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});
const DataLog = mongoose.model('DataLog', DataLogSchema);

// ==========================================
// 1. THE ARMS (Abstract Tools Definitions)
// ==========================================
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'fetch_external_api',
      description: 'Fetch raw data from any public HTTP API endpoint URL.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The complete endpoint URL string' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_to_database',
      description: 'Store or update data records inside the database repository.',
      parameters: {
        type: 'object',
        properties: {
          targetCollection: { type: 'string', description: 'Name classification of the data' },
          dataObject: { type: 'object', description: 'The JSON payload dictionary to store' }
        },
        required: ['targetCollection', 'dataObject']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_latest_database_entry',
      description: 'Query the most recent record matching a collection identifier to check for sync status.',
      parameters: {
        type: 'object',
        properties: { targetCollection: { type: 'string' } },
        required: ['targetCollection']
      }
    }
  }
];

// The actual code execution map matching the tool definitions
const executeTool = {
  fetch_external_api: async (args) => {
    console.log(`Executing Tool [fetch_external_api] for: ${args.url}`);
    const res = await fetch(args.url);
    return await res.text();
  },
  write_to_database: async (args) => {
    console.log(`Executing Tool [write_to_database] under classification: ${args.targetCollection}`);
    const newRecord = new DataLog({ collectionName: args.targetCollection, payload: args.dataObject });
    await newRecord.save();
    return JSON.stringify({ success: true, message: "Record successfully committed to Atlas." });
  },
  read_latest_database_entry: async (args) => {
    console.log(`Executing Tool [read_latest_database_entry] for: ${args.targetCollection}`);
    const latest = await DataLog.findOne({ collectionName: args.targetCollection }).sort({ timestamp: -1 });
    return latest ? JSON.stringify(latest.payload) : JSON.stringify({ message: "No records found." });
  }
};

// ==========================================
// 2. THE DECISION EXECUTION LOOP (The Engine)
// ==========================================
async function runAgentOrchestrator(userInstruction) {
  let messages = [
    { role: 'system', content: 'You are an autonomous operations engineer. Execute tasks using available tools sequentially. If a task requires a tool you do not have, state clearly which tool is missing.' },
    { role: 'user', content: userInstruction }
  ];

  let loopActive = true;
  let loopsRun = 0;
  const MAX_LOOPS = 5; // Guardrail safety ceiling

  while (loopActive && loopsRun < MAX_LOOPS) {
    loopsRun++;
    
    // Call Ollama Cloud with both the conversational thread and the available tools list
    const response = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}` },
      body: JSON.stringify({ model: 'gemma4:3b', messages: messages, tools: toolDefinitions, stream: false })
    });

    const data = await response.json();
    const assistantMessage = data.message;
    messages.push(assistantMessage);

    // Check if the AI model wants to use a tool arms mechanism
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const call of assistantMessage.tool_calls) {
        const toolName = call.function.name;
        const toolArgs = call.function.arguments;

        if (executeTool[toolName]) {
          try {
            const toolResult = await executeTool[toolName](toolArgs);
            // Feed the results back into the context conversation stream
            messages.push({ role: 'tool', tool_name: toolName, content: toolResult });
          } catch (err) {
            messages.push({ role: 'tool', tool_name: toolName, content: `Tool Execution Error: ${err.message}` });
          }
        } else {
          messages.push({ role: 'tool', tool_name: toolName, content: 'Error: Tool definition exists but runtime executor logic is missing.' });
        }
      }
    } else {
      // No more tools called; the AI model has finished running your instructions
      console.log(`[Final Agent Report]:\n${assistantMessage.content}`);
      loopActive = false;
    }
  }
}

// ==========================================
// 3. UNIVERSAL ENDPOINT
// ==========================================
app.post('/run-instruction', (req, res) => {
  const instruction = req.body.instruction;
  
  res.status(200).json({ status: "accepted", message: "Instruction accepted. Agent processing started." });
  
  // Hand control over to the agent runtime engine completely
  runAgentOrchestrator(instruction);
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(3000, () => console.log('Server running on port 3000')))
  .catch(err => console.error(err));