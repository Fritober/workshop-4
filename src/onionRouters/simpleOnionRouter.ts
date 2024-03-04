import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { generateRsaKeyPair, exportPubKey, importPrvKey, rsaDecrypt, exportPrvKey } from "../crypto";

const nodePrivateKeys = new Map<number, string>();

async function registerNode(nodeId: number) {
    const { publicKey, privateKey } = await generateRsaKeyPair();
    const pubKeyBase64 = await exportPubKey(publicKey);
    const prvKeyBase64 = await exportPrvKey(privateKey);

    nodePrivateKeys.set(nodeId, prvKeyBase64);

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
}

export async function simpleOnionRouter(nodeId: number) {
    const onionRouter = express();
    onionRouter.use(express.json());
    onionRouter.use(bodyParser.json());

    onionRouter.get("/status", (req, res) => {
        res.send("live");
    });

    onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
        res.json({ result: lastReceivedEncryptedMessage });
    });

    onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
        res.json({ result: lastReceivedDecryptedMessage });
    });

    onionRouter.get("/getLastMessageDestination", (req, res) => {
        res.json({ result: lastMessageDestination });
    });

    // Register the node upon startup
    await registerNode(nodeId);

    onionRouter.post("/message", async (req, res) => {
        try {
            const { message } = req.body;
            lastReceivedEncryptedMessage = message;

            const privateKeyBase64 = nodePrivateKeys.get(nodeId);
            if (!privateKeyBase64) {
                return res.status(500).send("Node's private key not found.");
            }
            const privateKey = await importPrvKey(privateKeyBase64);

            const decryptedMessage = await rsaDecrypt(message, privateKey);
            lastReceivedDecryptedMessage = decryptedMessage;

            const nextDestination = parseInt(decryptedMessage.slice(0, 10), 10);
            lastMessageDestination = nextDestination.toString();

            if (nextDestination >= BASE_ONION_ROUTER_PORT) {
                const forwardUrl = `http://localhost:${nextDestination}/message`;
                await fetch(forwardUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: decryptedMessage.slice(10) }),
                });
            }

            res.send("Message forwarded.");
        } catch (error) {
            console.error("Error handling message:", error);
            res.status(500).send("Internal Server Error");
        }
    });

    onionRouter.get("/getPrivateKey", (req, res) => {
        const nodeIdParam = req.query.nodeId;
        if (nodeIdParam === undefined || typeof nodeIdParam !== 'string') {
            return res.status(400).send("Node ID is required");
        }

        const nodeId = parseInt(nodeIdParam, 10);
        if (isNaN(nodeId)) {
            return res.status(400).send("Invalid Node ID");
        }

        const privateKey = nodePrivateKeys.get(nodeId);
        if (!privateKey) {
            return res.status(404).send("Node's private key not found.");
        }

        res.json({ result: privateKey });
    });

    return onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
        console.log(`Onion router ${nodeId} is listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
    });
}
