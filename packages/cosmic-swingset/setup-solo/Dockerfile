FROM debian:stretch AS build

RUN apt-get update -y && apt-get install gcc python3 python3-venv python3-dev -y && apt-get clean -y

WORKDIR /usr/src/app
RUN python3 -mvenv ve3
RUN ve3/bin/pip install wheel
COPY . setup-solo/
RUN ve3/bin/pip install setup-solo/

FROM agoric/cosmic-swingset-solo AS install

WORKDIR /usr/src/app
RUN apt-get update -y && apt-get install python3 -y && apt-get clean -y
COPY --from=build /usr/src/app/ve3/ /usr/src/app/ve3/

WORKDIR /usr/src/app/solo

ENTRYPOINT ["../ve3/bin/ag-setup-solo"]
