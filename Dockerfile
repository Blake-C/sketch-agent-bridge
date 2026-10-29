FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
RUN npm install --global pnpm@12.15.0 && apk add --no-cache git && mkdir -p /repo/node_modules && chown -R node:node /repo
WORKDIR /repo
USER node
