import http from "node:http";
import express from "express";
import path from "node:path";
import { Server } from "socket.io";

import { publisher, subscriber, redis } from "./redis-connection.js";


const CHECKBOX_SIZE = 10000;
const CHECKBOX_STATE_KEY = "checkbox-state"




async function main() {
    const app = express();

    const server = http.createServer(app);

    const PORT = process.env.PORT ?? 8000;

    const io = new Server();

    io.attach(server);

    await subscriber.subscribe("internal-server:checkbox:change")
    subscriber.on("message", (channel, message) => {
        if(channel === "internal-server:checkbox:change") {
            const { index, checked } = JSON.parse(message)
            


            io.emit("server:checkbox:change", { index, checked });
        }
    })

    io.on("connection", (socket) => {
        console.log(`Socket connected`, { id: socket.id });

        socket.on("client:checkbox:change", async (data) => {
            console.log(`[Socket:{socket.id}]:client:checkbox:change`, data);
            const exisitingState = await redis.get(CHECKBOX_STATE_KEY)


            if(exisitingState) {
                const remoteData = JSON.parse(exisitingState)
                remoteData[data.index] = data.checked;

                await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(remoteData))
            } else {
                await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(new Array(CHECKBOX_SIZE).fill(false)))
            }
            
            // io.emit("server:checkbox:change", data);
            // state.checkboxes[data.index] = data.checked;
            await publisher.publish('internal-server:checkbox:change',
                JSON.stringify(data),
            )
        })
    })

    

    app.use(express.static(path.resolve("./public")));

    app.get("/health", (req, res) => res.json({ healthy: true }));

    app.get("/checkboxes", async (req, res) => {
        const exisitingState = await redis.get(CHECKBOX_STATE_KEY)
        if(exisitingState) {
                const remoteData = JSON.parse(exisitingState)
                return res.json({ checkboxes: remoteData });
        }
        return res.json({ checkboxes: new Array(CHECKBOX_SIZE).fill(false) });
    })

    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    })
}

main();