package pe.canchero.backend.web.controller;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.config.ApiAuthorizationInterceptor;
import pe.canchero.backend.service.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static pe.canchero.backend.it.PostgresTestSupport.*;

class ChatControllerTest {
    @Test void chatRequiresAuthenticationAndUsesTheVerifiedUser() throws Exception {
        var sessions=new AuthTokenService("unit-test-only-secret");
        var accounts=mock(AuthService.class);var chat=mock(ChatService.class);
        when(accounts.currentUser(PLAYER_1_ID)).thenReturn(Optional.of(PLAYER_1));
        when(chat.list(PLAYER_1)).thenReturn(List.of());
        var mvc=MockMvcBuilders.standaloneSetup(new ChatController(chat))
                .addInterceptors(new ApiAuthorizationInterceptor(sessions,accounts)).build();
        mvc.perform(get("/api/chat/conversations")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/chat/conversations").header("Authorization","Bearer "+sessions.issue(PLAYER_1_ID)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(content().json("[]"));
        UUID id=UUID.randomUUID(),requestId=UUID.randomUUID();
        mvc.perform(post("/api/chat/conversations/"+id+"/messages").header("Authorization","Bearer "+sessions.issue(PLAYER_1_ID))
                .contentType("application/json").content("{\"text\":\"Hola\",\"requestId\":\""+requestId+"\",\"authorId\":\""+OWNER_A_ID+"\"}"))
                .andExpect(status().isOk());
        verify(chat).send(PLAYER_1,id,"Hola",requestId);
    }
}
