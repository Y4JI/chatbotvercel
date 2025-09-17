import axios from 'axios';

// --- Environment Variables ---
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const PYTHON_API_URL = process.env.PYTHON_API_URL; // The ngrok URL you just added

// --- In-Memory Chat History Storage ---
// This will store conversation histories for different users.
// Note: This is a simple solution. It will reset if your Vercel serverless function
// goes to sleep (cold start). For a production app, you might use a database like Redis.
const chatHistories = {};

export default async function handler(req, res) {
  // --- Handle Webhook Verification (GET request) ---
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  // --- Handle Incoming Messages (POST request) ---
  if (req.method === 'POST') {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry) {
        const event = entry.messaging[0];
        const senderPsid = event.sender.id; // Unique ID for each user

        if (event.message && event.message.text) {
          const receivedText = event.message.text;
          console.log(`Message from ${senderPsid}:`, receivedText);

          // Get the existing history for this user, or start a new one
          const userHistory = chatHistories[senderPsid] || [];
          
          try {
            // --- CALL THE PYTHON AI BACKEND ---
            const aiResponse = await getAIResponse(receivedText, userHistory);
            
            // Send the AI's response back to the user
            await sendMessage(senderPsid, aiResponse.response);
            
            // Update the history for this user
            chatHistories[senderPsid] = aiResponse.history;

          } catch (error) {
            console.error('Error getting AI response:', error);
            await sendMessage(senderPsid, "Sorry, I'm having trouble thinking right now. Please try again in a moment.");
          }
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }
    return res.sendStatus(404);
  }

  return res.status(405).send('Method Not Allowed');
}

/**
 * Calls your Python Flask API to get the AI-generated response.
 * @param {string} message The user's message.
 * @param {Array} history The current conversation history.
 * @returns {Promise<Object>} A promise that resolves to the JSON response from the API.
 */
async function getAIResponse(message, history) {
  if (!PYTHON_API_URL) {
      throw new Error("PYTHON_API_URL environment variable is not set.");
  }

  console.log(`Sending to Python API: ${message}`);
  
  const response = await axios.post(PYTHON_API_URL, {
    message: message,
    history: history
  });

  return response.data; // Should return { response: "...", history: [...] }
}

/**
 * Sends a message back to the user via the Facebook Graph API.
 * @param {string} senderPsid The user's Page-Scoped ID.
 * @param {string} responseText The text to send.
 */
async function sendMessage(senderPsid, responseText) {
  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  const messageData = {
    recipient: { id: senderPsid },
    message: { text: responseText },
    messaging_type: "RESPONSE"
  };

  await axios.post(url, messageData);
}