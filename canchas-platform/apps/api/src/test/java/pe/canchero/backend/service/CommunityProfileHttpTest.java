package pe.canchero.backend.service;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.config.ApiAuthorizationInterceptor;
import pe.canchero.backend.web.controller.CommunityProfileController;
import pe.canchero.backend.web.dto.AuthUserDto;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CommunityProfileHttpTest {
  final UUID id=UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  CommunityProfileService service;MockMvc mvc;AuthTokenService tokens;AuthUserDto user;
  @BeforeEach void setup(){
    service=mock(CommunityProfileService.class);tokens=new AuthTokenService("community-test-only-secret");
    user=new AuthUserDto(id.toString(),"Persona","privado@test",null,"cliente");
    var auth=mock(AuthService.class);when(auth.currentUser(id)).thenReturn(Optional.of(user));
    mvc=MockMvcBuilders.standaloneSetup(new CommunityProfileController(service)).addInterceptors(new ApiAuthorizationInterceptor(tokens,auth)).build();
  }
  @Test void readOnlyFeedIsPublicButSettingsPostsFollowAndRelationshipRequireSession() throws Exception {
    when(service.posts(id,0)).thenReturn(new CommunityProfileService.PostPage(List.of(),false));
    mvc.perform(get("/api/community/profiles/"+id+"/posts")).andExpect(status().isOk());
    mvc.perform(post("/api/community/posts").contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"No\"}")).andExpect(status().isUnauthorized());
    mvc.perform(put("/api/community/me/settings").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    mvc.perform(put("/api/community/profiles/"+id+"/follow")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/community/profiles/"+id+"/relationship")).andExpect(status().isUnauthorized());
    mvc.perform(delete("/api/community/posts/"+id)).andExpect(status().isUnauthorized());
    verify(service,never()).publish(any(),any(),any());
    verify(service,never()).saveSettings(any(),any());
  }
  @Test void postAuthorAlwaysComesFromAuthenticatedSession() throws Exception {
    when(service.publish(eq(user),eq("Mi partido"),eq(List.of()))).thenReturn(new CommunityProfileService.Post(UUID.randomUUID().toString(),id.toString(),"Mi partido",List.of(),"2026-11-07T19:00:00Z"));
    mvc.perform(post("/api/community/posts").header("Authorization","Bearer "+tokens.issue(id,true)).contentType(MediaType.APPLICATION_JSON)
      .content("{\"text\":\"Mi partido\",\"photos\":[],\"authorId\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"}"))
      .andExpect(status().isCreated()).andExpect(jsonPath("$.authorId").value(id.toString()));
    verify(service).publish(eq(user),eq("Mi partido"),eq(List.of()));
  }
}
