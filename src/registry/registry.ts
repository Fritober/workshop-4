import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";

export type Node = { nodeId: number; pubKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  const registeredNodes: Node[] = [];

  _registry.post("/registerNode", (req: Request<{}, {}, RegisterNodeBody>, res: Response) => {
    const { nodeId, pubKey } = req.body;

    const existingNode = registeredNodes.find((node) => node.nodeId === nodeId);
    if (existingNode) {
      res.status(400).json({ error: `Node ${nodeId} is already registered.` });
    } else {
      // Register the new node
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
