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

    async function getOrInitializeState() {
        const existingState = await redis.get(CHECKBOX_STATE_KEY);

        if (existingState) {
            return JSON.parse(existingState);
        }

        const initialState = new Array(CHECKBOX_SIZE).fill(false);
        await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(initialState));
        return initialState;
    }

    io.on("connection", (socket) => {
        console.log(`Socket connected`, { id: socket.id });

        // socket.on("client:checkbox:change", async (data) => {
        //     console.log(`[Socket:{socket.id}]:client:checkbox:change`, data);

        //     const state = await getOrInitializeState();
        //     state[data.index] = data.checked;

        //     await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(state));

        //     await publisher.publish(
        //         "internal-server:checkbox:change",
        //         JSON.stringify(data)
        //     );
        // });

        socket.on("client:checkbox:change", async (data) => {
            const { index, checked } = data;

            if (checked) {
                await redis.hset(CHECKBOX_STATE_KEY, index, "1");
            } else {
                await redis.hDel(CHECKBOX_STATE_KEY, index);
            }

            await publisher.publish(
                "internal-server:checkbox:change",
                JSON.stringify(data)
            );
        });
    })

    

    app.use(express.static(path.resolve("./public")));

    app.get("/health", (req, res) => res.json({ healthy: true }));

    // app.get("/checkboxes", async (req, res) => {
    //     const state = await getOrInitializeState();
    //     return res.json({ checkboxes: state });
    // });

    app.get("/checkboxes", async (req, res) => {
        const data = await redis.hgetall(CHECKBOX_STATE_KEY);

        const checkboxes = new Array(CHECKBOX_SIZE).fill(false);

        for (const index in data) {
            checkboxes[index] = true;
        }

        return res.json({ checkboxes });
    });

    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    })
}

main();