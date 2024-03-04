import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import { generateSymmetricKey, rsaEncrypt, encryptWithSymmetricKey } from "../crypto";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  _user.get("/status", (req, res) => {
    res.send("live");
  });

  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  _user.post('/message', (req, res) => {
    const { message } = req.body;
    lastReceivedMessage = message;
    res.status(200).send("success");
  });

  _user.post('/sendMessage', async (req, res) => {
    try {
      const { message, destinationUserId } = req.body;
      const circuit = await createRandomCircuit(destinationUserId);
      const symmetricKeys = circuit.map(() => generateSymmetricKey());
      let encryptedMessage = message;
      for (let i = 0; i < circuit.length; i++) {
        const destination = circuit[i].toString().padStart(10, '0');
        const layer1 = await encryptWithSymmetricKey(encryptedMessage, symmetricKeys[i]);
        const layer2 = await rsaEncrypt(symmetricKeys[i], circuit[i]);
        encryptedMessage = layer1 + layer2;
      }
      const entryNodeUrl = `http://localhost:${BASE_ONION_ROUTER_PORT + circuit[0]}/message`;
      const response = await fetch(entryNodeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: encryptedMessage }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message to user ${destinationUserId}. Status: ${response.status}`);
      }
      lastSentMessage = message;

      res.json({ success: true });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}

async function createRandomCircuit(destinationUserId: number): Promise<number[]> {
  const availableNodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const circuit = availableNodes.filter(nodeId => nodeId !== destinationUserId).slice(0, 3);
  return circuit;
}

export default user;
