import bodyParser from "body-parser";
import express from "express";
import { REGISTRY_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import {
    generateRsaKeyPair,
    exportPubKey,
    importPrvKey,
    rsaDecrypt,
    exportPrvKey,
} from "../crypto";

export type Node = {
    nodeId: number;
    pubKey: string;
};

export type RegisterNodeBody = {
    nodeId: number;
    pubKey: string;
};

export type GetNodeRegistryBody = {
    nodes: Node[];
};

const registeredNodes: Node[] = [];

export async function launchRegistry() {
    const _registry = express();
    _registry.use(express.json());
    _registry.use(bodyParser.json());

    _registry.post("/registerNode", async (req, res) => {
        const { nodeId, pubKey } = req.body;

        const existingNode = registeredNodes.find((node) => node.nodeId === nodeId);
        if (existingNode) {
            res.status(400).json({ error: `Node ${nodeId} is already registered.` });
        } else {
            registeredNodes.push({ nodeId, pubKey });
            res.json({ success: true });
        }
    });

    _registry.get("/getNodeRegistry", (req, res) => {
        const getNodeRegistryBody: GetNodeRegistryBody = {
            nodes: registeredNodes,
        };
        res.json(getNodeRegistryBody);
    });

    _registry.get("/status", (req, res) => {
        res.send("live");
    });

    const server = _registry.listen(REGISTRY_PORT, () => {
        console.log(`Registry is listening on port ${REGISTRY_PORT}`);
    });

    return server;
}

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

    onionRouter.get("/getPrivateKey", async (req, res) => {
        try {
            const { publicKey, privateKey } = await generateRsaKeyPair();

            const privateKeyBase64 = await exportPrvKey(privateKey);

            res.json({ result: privateKeyBase64 });
        } catch (error) {
            console.error("Error generating or exporting private key:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    onionRouter.post("/registerNode", async (req, res) => {
        const { nodeId, pubKey } = req.body;

        try {
            const registryResponse = await registerNodeOnRegistry(nodeId, pubKey);
            res.json(registryResponse);
        } catch (error) {
            console.error("Error registering node on the registry:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
        console.log(
            `Onion router ${nodeId} is listening on port ${
                BASE_ONION_ROUTER_PORT + nodeId
            }`
        );
    });

    return server;
}

async function registerNodeOnRegistry(nodeId: number, pubKey: string) {
    return new Promise<{ success: boolean; error?: string }>((resolve: (value: { success: boolean; error?: string }) => void, reject) => {
        const registryUrl = `http://localhost:${REGISTRY_PORT}/registerNode`;

        const requestOptions: RequestInit = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ nodeId, pubKey }),
        };

        fetch(registryUrl, requestOptions)
            .then((response) => response.json())
            .then((result) => {
                resolve(result);
            })
            .catch((error) => {
                reject(error);
            });
    });
}


