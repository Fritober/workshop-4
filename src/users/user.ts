import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import { createRandomSymmetricKey, exportSymKey, rsaEncrypt, symEncrypt } from "../crypto";

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

    // Create a random circuit of 3 distinct nodes
    const circuit = await createRandomCircuit(destinationUserId);

    // Create a unique symmetric key for each node of the circuit
    const symmetricKeys = await Promise.all(circuit.map(() => createRandomSymmetricKey()));

    // Encrypt the message with each layer of encryption
    let encryptedMessage = message;
    for (let i = 0; i < circuit.length; i++) {
      const destination = circuit[i].toString().padStart(10, '0');
      const symmetricKeyStr = await exportSymKey(symmetricKeys[i]);
      const layer1 = await symEncrypt(encryptedMessage, symmetricKeyStr);
      const layer2 = await rsaEncrypt(symmetricKeyStr, circuit[i]);
      encryptedMessage = layer1 + layer2;
    }

    // Forward the encrypted message to the entry node's HTTP POST /message route
    const entryNodeUrl = `http://localhost:${BASE_ONION_ROUTER_PORT + circuit[0]}/message`;
    const response = await fetch(entryNodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: encryptedMessage }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message to user ${destinationUserId}. Status: ${response.status}`);
    }

    // Update the last sent message on success
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
