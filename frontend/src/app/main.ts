import { createApp } from "vue";
import { Alert, Button, Input, Progress, Steps, Tag } from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import "@/shared/styles/global.css";
import App from "./App.vue";

const app = createApp(App);
app.use(Alert);
app.use(Button);
app.use(Input);
app.use(Progress);
app.use(Steps);
app.use(Tag);
app.mount("#app");
