FROM node:9-alpine as build-stage

WORKDIR /app

# install build dependencies
RUN apk add --no-cache \
    bash \
    git \
    make

# install application dependencies
COPY package.json yarn.lock ./
RUN yarn install --non-interactive --frozen-lockfile

# copy in application source
COPY . .

# run tests and build typescript sources
RUN make lib ci-test

# prune modules
RUN yarn install --non-interactive --frozen-lockfile --production

# copy built application to runtime image
FROM node:9-alpine
WORKDIR /app
COPY --from=build-stage /app/config config
COPY --from=build-stage /app/lib lib
COPY --from=build-stage /app/node_modules node_modules

# run in production mode on port 8080
EXPOSE 8080
ENV PORT 8080
ENV NODE_ENV production
CMD [ "node", "lib/app.js" ]
