import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { generateRsaKeyPair, exportPubKey, importPrvKey, rsaDecrypt, exportPrvKey } from "../crypto";

export async function simpleOnionRouter(nodeId: number) {
    const onionRouter = express();
    onionRouter.use(express.json());
    onionRouter.use(bodyParser.json());

    onionRouter.get("/status", (req, res) => {
        res.send("live");
    });

    let lastReceivedEncryptedMessage: string | null = null;
    let lastReceivedDecryptedMessage: string | null = null;
    let lastMessageDestination: number | null = null;

    onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
        res.json({ result: lastReceivedEncryptedMessage });
    });

    onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
        res.json({ result: lastReceivedDecryptedMessage });
    });

    onionRouter.get("/getLastMessageDestination", (req, res) => {
        res.json({ result: lastMessageDestination });
    });

    const { publicKey, privateKey } = await generateRsaKeyPair();
    const pubKeyBase64 = await exportPubKey(publicKey);
    const prvKeyBase64 = await exportPrvKey(privateKey);

    try {
        const response = await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId, pubKey: pubKeyBase64 }),
        });

        if (!response.ok) {
            throw new Error(`Failed to register node ${nodeId}. Status: ${response.status}`);
        }

        console.log(`Node ${nodeId} registered successfully.`);
    } catch (error) {
        console.error(`Error registering node ${nodeId}:`, error);
    }

    onionRouter.get("/getPrivateKey", async (req, res) => {
        res.json({ result: prvKeyBase64 });
    });

    onionRouter.post("/message", async (req, res) => {
        try {
            const { message } = req.body;
            lastReceivedEncryptedMessage = message;

            const privateKeyBase64 = await exportPrvKey(privateKey);
            const privateKey = await importPrvKey(privateKeyBase64);

            const decryptedMessage = await rsaDecrypt(message, privateKey);
            lastReceivedDecryptedMessage = decryptedMessage;

            const nextDestination = parseInt(decryptedMessage.slice(0, 10));
            const nestedMessage = decryptedMessage.slice(10);
            lastMessageDestination = nextDestination;
            
            if (nextDestination >= BASE_ONION_ROUTER_PORT) {
                const forwardUrl = `http://localhost:${nextDestination}/message`;
                await fetch(forwardUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: nestedMessage }),
                });
            }

            res.send("Message forwarded.");
        } catch (error) {
            console.error("Error processing message:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    onionRouter.get("/getNodeRegistry", async (req, res) => {
        try {
            const response = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
            if (!response.ok) {
                throw new Error(`Failed to retrieve node registry. Status: ${response.status}`);
            }

            const registry = await response.json();
            res.json(registry);
        } catch (error) {
            console.error("Error retrieving node registry:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
        console.log(`Onion router ${nodeId} is listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
    });

    return server;
}
