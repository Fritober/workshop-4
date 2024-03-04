import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
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
    const { message, destinationUserId } = req.body as SendMessageBody;

    try {
      const nodes = await fetchNodesFromRegistry();
      const circuit = selectRandomNodes(nodes, 3);
      let encryptedMessage = message;
      let destination = destinationUserId.toString().padStart(10, '0');

      for (let i = circuit.length - 1; i >= 0; i--) {
        const node = circuit[i];
        const symKey = await createRandomSymmetricKey();
        encryptedMessage = await symEncrypt(symKey, `${destination}${encryptedMessage}`);
        const encryptedSymKey = await rsaEncrypt(await exportSymKey(symKey), node.pubKey);
        encryptedMessage = `${encryptedSymKey}${encryptedMessage}`;
        destination = (BASE_ONION_ROUTER_PORT + (i > 0 ? circuit[i - 1].nodeId : destinationUserId)).toString().padStart(10, '0');
      }

      await forwardMessageToNode(circuit[0], encryptedMessage);
      res.status(200).send({ message: 'Message sent successfully through the network.' });
    } catch (error) {
      console.error(error);
      res.status(500).send({ error: 'Failed to send message through the network.' });
    }
  });
  
  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  

  return server;
}

export async function fetchNodesFromRegistry(): Promise<any[]> {
    const response = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
    if (!response.ok) {
        throw new Error('Failed to fetch nodes from registry');
    }
    const data: { nodes: any[] } = await response.json();
    return data.nodes;
}

export async function forwardMessageToNode(node: { nodeId: number; }, message: string): Promise<void> {
    const forwardUrl = `http://localhost:${BASE_ONION_ROUTER_PORT + node.nodeId}/message`;
    const response = await fetch(forwardUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    });

    if (!response.ok) {
        throw new Error(`Failed to forward message to node ${node.nodeId}. Status: ${response.status}`);
    }
}

function selectRandomNodes(nodes: any[], count: number) {
  let shuffled = nodes.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
