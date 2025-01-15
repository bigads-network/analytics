import { readFileSync } from "fs";
import path from "path";
import yaml from "js-yaml";

const swaggerPath = path.join(path.resolve(), "swagger.yaml");
const apiDocs = yaml.load(readFileSync(swaggerPath, "utf8"));

export default apiDocs;