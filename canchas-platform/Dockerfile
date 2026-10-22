# 1. Etapa de compilación con JDK 17 y Maven instalado nativamente
FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app

# Instalamos maven para compilar sin depender del archivo mvnw (evita errores de formato/CRLF)
RUN apk add --no-cache maven

# Copiamos todo el contenido del directorio de la API
COPY . .

# Compilamos el proyecto usando maven global omitiendo las pruebas
RUN mvn clean package -DskipTests

# 2. Etapa de ejecución ligera con JRE 17
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Copiamos el JAR generado
COPY --from=build /app/target/*.jar app.jar

# Puerto de la app
EXPOSE 8080

# Comando de inicio
ENTRYPOINT ["java", "-jar", "app.jar"]